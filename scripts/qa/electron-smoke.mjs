import { _electron as electron } from 'playwright';
import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const electronMain = path.join(repoRoot, 'dist-electron/electron/main.js');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
const allowedModes = new Set(['dev', 'file', 'app']);
const requestedMode = process.env.CHATON_ELECTRON_SMOKE_MODE ?? 'dev';
const mode = allowedModes.has(requestedMode) ? requestedMode : 'dev';
const flow = process.env.CHATON_ELECTRON_SMOKE_FLOW === 'interactive' ? 'interactive' : 'startup';
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const packagedAppPath = process.env.CHATON_ELECTRON_SMOKE_APP_PATH
  ? path.resolve(process.env.CHATON_ELECTRON_SMOKE_APP_PATH)
  : path.join(repoRoot, 'release', 'mac-arm64', 'Chatons.app');
const screenshotDir = path.join(repoRoot, 'output/playwright');
const expectedModel = process.env.CHATON_EXPECTED_MODEL?.trim() || null;
const promptText = process.env.CHATON_ELECTRON_SMOKE_PROMPT?.trim() || null;
const expectedReply = process.env.CHATON_ELECTRON_SMOKE_EXPECTED_REPLY?.trim() || null;
const expectedReplyMode = process.env.CHATON_ELECTRON_SMOKE_EXPECTED_REPLY_MODE === 'contains'
  ? 'contains'
  : 'exact';
const promptTimeoutMs = Number.parseInt(process.env.CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS ?? '120000', 10);
const expectedAppVersion = process.env.CHATON_EXPECTED_APP_VERSION?.trim() || packageJson.version;
const shouldUseBlankUserData = process.env.CHATON_ELECTRON_SMOKE_BLANK_USER_DATA === '1';
const shouldUseFreshUserData = process.env.CHATON_ELECTRON_SMOKE_FRESH_USER_DATA === '1';
const shouldExpectOnboarding = shouldUseBlankUserData || process.env.CHATON_ELECTRON_SMOKE_EXPECT_ONBOARDING === '1';
const shouldIsolateUserData = shouldUseBlankUserData || shouldUseFreshUserData || process.env.CHATON_ELECTRON_SMOKE_ISOLATE_USER_DATA === '1' || Boolean(promptText);
const keepIsolatedUserData = process.env.CHATON_ELECTRON_SMOKE_KEEP_USER_DATA === '1';
const consoleErrors = [];
const networkFailures = [];
const mainProcessLogs = [];
const mainProcessFailures = [];
const observedPages = new WeakSet();
let app = null;
let cleanupPromise = null;
let tempUserDataRemoved = false;
let packagedExecutablePattern = null;
const maxMainProcessLogEntries = 200;
const appCloseTimeoutMs = Number.parseInt(process.env.CHATON_ELECTRON_SMOKE_CLOSE_TIMEOUT_MS ?? '8000', 10);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExpectedModelNeedles(modelKey) {
  if (!modelKey) {
    return [];
  }
  const needles = new Set([modelKey]);
  const modelId = modelKey.includes('/') ? modelKey.slice(modelKey.lastIndexOf('/') + 1) : modelKey;
  if (modelId) {
    needles.add(modelId);
  }
  return [...needles];
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!port) {
          reject(new Error('Failed to allocate free port'));
          return;
        }
        resolve(port);
      });
    });
  });
}

async function probeHttpOk(url, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode === 200));
    });
    request.once('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.once('error', () => resolve(false));
  });
}

async function waitForHttpOk(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeHttpOk(url, Math.min(500, Math.max(1, deadline - Date.now())))) {
      return true;
    }
    await wait(100);
  }
  return false;
}

async function ensureDevRendererAvailable(url, timeoutMs = 15_000) {
  if (!await waitForHttpOk(url, timeoutMs)) {
    throw new Error(`Dev renderer server is not reachable at ${url}. Start npm run dev:renderer or use CHATON_ELECTRON_SMOKE_MODE=file/app.`);
  }
  return { url };
}

async function listenHttpOkServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address !== 'object') {
    server.close();
    throw new Error('Dev server preflight self-test could not allocate HTTP fixture port');
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function selfTestDevServerPreflight() {
  const missingPort = await getFreePort();
  const missingUrl = `http://127.0.0.1:${missingPort}`;
  let missingError = null;
  try {
    await ensureDevRendererAvailable(missingUrl, 250);
  } catch (error) {
    missingError = error instanceof Error ? error.message : String(error);
  }
  if (!missingError?.includes('Dev renderer server is not reachable')) {
    throw new Error(`Dev server preflight self-test expected a clear missing-server error, got: ${missingError ?? 'none'}`);
  }

  const fixture = await listenHttpOkServer();
  try {
    await ensureDevRendererAvailable(fixture.url, 1000);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }

  return { missingUrl, liveUrl: fixture.url };
}

async function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      reject(new Error(`Timed out waiting for process ${child.pid ?? 'unknown'} to exit`));
    }, timeoutMs);
    const onExit = (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    };
    child.once('exit', onExit);
  });
}

async function closeElectronApp(appInstance, timeoutMs = appCloseTimeoutMs) {
  const child = appInstance.process();
  const close = appInstance.close().then(
    () => ({ ok: true }),
    (error) => ({ ok: false, error }),
  );
  close.catch(() => undefined);
  const timeout = wait(timeoutMs).then(() => ({ ok: false, timeout: true }));
  const result = await Promise.race([close, timeout]);
  if (result.ok) {
    return;
  }

  const reason = result.timeout
    ? `timed out after ${timeoutMs}ms`
    : result.error instanceof Error
      ? result.error.message
      : String(result.error ?? 'unknown error');
  console.warn(`[Smoke] app.close() did not finish cleanly (${reason}); terminating Electron process`);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await waitForProcessExit(child, 3000).catch(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    });
  }
}

async function listProcessCommands(pattern) {
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'pid,ppid,command'], { encoding: 'utf8' }, (_error, stdout) => {
      resolve(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.includes(pattern)),
      );
    });
  });
}

async function terminateProcessCommands(pattern) {
  const lines = await listProcessCommands(pattern);
  const pids = lines
    .map((line) => Number.parseInt(line.split(/\s+/, 1)[0], 10))
    .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process may have already exited.
    }
  }
  if (pids.length > 0) {
    await wait(500);
  }
  for (const line of await listProcessCommands(pattern)) {
    const pid = Number.parseInt(line.split(/\s+/, 1)[0], 10);
    if (Number.isFinite(pid) && pid > 0 && pid !== process.pid) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process may have already exited.
      }
    }
  }
}

function getChatonBaseDir() {
  return path.join(os.homedir(), '.chaton');
}

function createExtensionServerFixture(extensionId, port) {
  const extensionRoot = path.join(getChatonBaseDir(), 'extensions', extensionId);
  fs.mkdirSync(extensionRoot, { recursive: true });
  const serverPath = path.join(extensionRoot, 'server.js');
  fs.writeFileSync(serverPath, `
const http = require('node:http');
const port = Number(process.env.CHATON_SMOKE_EXTENSION_PORT);
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end('not found');
});
server.listen(port, '127.0.0.1');
if (process.env.CHATON_SMOKE_IGNORE_SIGTERM === '1') {
  process.on('SIGTERM', () => undefined);
} else {
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
`, 'utf8');
  return { extensionRoot, serverPath };
}

async function runExtensionServerShutdownSelfTest() {
  const port = await getFreePort();
  const extensionId = `smoke-shutdown-${process.pid}-${Date.now()}`;
  const readyUrl = `http://127.0.0.1:${port}/health`;
  const { extensionRoot } = createExtensionServerFixture(extensionId, port);
  let launchedApp = null;

  try {
    const selfTestEnv = {
      ...launchEnv,
    };
    delete selfTestEnv.VITE_DEV_SERVER_URL;
    delete selfTestEnv.CHATON_ELECTRON_SMOKE_SELF_TEST;
    launchedApp = await electron.launch({
      args: [electronMain],
      cwd: repoRoot,
      env: selfTestEnv,
    });
    observeMainProcess(launchedApp);
    const { window } = await waitForAppWindow(launchedApp, 15_000);
    if (!window) {
      throw new Error('Extension server shutdown self-test could not open app window');
    }
    const registration = await launchedApp.evaluate(async ({ app: electronApp }, payload) => {
      const bridge = globalThis.__chatonRegisterExtensionServer;
      if (typeof bridge !== 'function') {
        return { ok: false, message: 'bridge missing' };
      }
      return bridge(payload);
    }, {
      extensionId,
      command: 'node',
      args: ['server.js'],
      cwd: '.',
      env: {
        CHATON_SMOKE_EXTENSION_PORT: String(port),
        CHATON_SMOKE_IGNORE_SIGTERM: '1',
      },
      readyUrl,
      readyTimeoutMs: 5000,
    });
    if (!registration?.ok) {
      throw new Error(`Extension server registration failed: ${registration?.message ?? 'unknown error'}`);
    }
    if (!await waitForHttpOk(readyUrl, 7000)) {
      throw new Error(`Extension server did not become ready at ${readyUrl}`);
    }

    const electronProcess = launchedApp.process();
    await launchedApp.evaluate(async ({ app: electronApp }) => {
      electronApp.quit();
    });
    await waitForProcessExit(electronProcess, 6000);
    launchedApp = null;
    await wait(500);
    if (await probeHttpOk(readyUrl, 1000)) {
      throw new Error(`Extension server was still alive after app shutdown: ${readyUrl}`);
    }
    return { extensionId, readyUrl };
  } finally {
    if (launchedApp) {
      await launchedApp.close().catch(() => undefined);
    }
    fs.rmSync(extensionRoot, { recursive: true, force: true });
  }
}

function getDefaultUserDataDir() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Chatons');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Chatons');
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'Chatons');
}

function copyFileIfExists(source, target) {
  if (!fs.existsSync(source)) {
    return false;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function quoteSqliteCliString(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  if (aboveDistance <= upperLeftDistance) {
    return above;
  }
  return upperLeft;
}

function readPngChunks(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < signature.length || !buffer.subarray(0, signature.length).equals(signature)) {
    throw new Error('Screenshot is not a PNG file');
  }

  let offset = signature.length;
  const chunks = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error(`PNG chunk ${type} exceeds file length`);
    }
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === 'IEND') {
      break;
    }
  }
  return chunks;
}

function analyzePngScreenshot(filePath) {
  const chunks = readPngChunks(fs.readFileSync(filePath));
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  if (!ihdr || ihdr.length !== 13) {
    throw new Error('PNG screenshot is missing a valid IHDR chunk');
  }

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const compression = ihdr[10];
  const filter = ihdr[11];
  const interlace = ihdr[12];
  const channelsByColorType = new Map([
    [0, 1],
    [2, 3],
    [4, 2],
    [6, 4],
  ]);
  const channels = channelsByColorType.get(colorType);
  if (!channels || bitDepth !== 8 || compression !== 0 || filter !== 0 || interlace !== 0) {
    throw new Error(`Unsupported PNG screenshot format: bitDepth=${bitDepth} colorType=${colorType} compression=${compression} filter=${filter} interlace=${interlace}`);
  }

  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data));
  if (idat.length === 0) {
    throw new Error('PNG screenshot has no IDAT data');
  }
  const inflated = zlib.inflateSync(idat);
  const rowLength = width * channels;
  const expectedLength = height * (rowLength + 1);
  if (inflated.length !== expectedLength) {
    throw new Error(`PNG screenshot has unexpected pixel data length: expected=${expectedLength} actual=${inflated.length}`);
  }

  const previousRow = Buffer.alloc(rowLength);
  const currentRow = Buffer.alloc(rowLength);
  const uniqueColors = new Set();
  let sampledPixels = 0;
  const sampleStepX = Math.max(1, Math.floor(width / 160));
  const sampleStepY = Math.max(1, Math.floor(height / 100));

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowLength + 1);
    const filterType = inflated[rowOffset];
    const source = inflated.subarray(rowOffset + 1, rowOffset + 1 + rowLength);
    for (let x = 0; x < rowLength; x += 1) {
      const left = x >= channels ? currentRow[x - channels] : 0;
      const above = previousRow[x];
      const upperLeft = x >= channels ? previousRow[x - channels] : 0;
      switch (filterType) {
        case 0:
          currentRow[x] = source[x];
          break;
        case 1:
          currentRow[x] = (source[x] + left) & 0xff;
          break;
        case 2:
          currentRow[x] = (source[x] + above) & 0xff;
          break;
        case 3:
          currentRow[x] = (source[x] + Math.floor((left + above) / 2)) & 0xff;
          break;
        case 4:
          currentRow[x] = (source[x] + paethPredictor(left, above, upperLeft)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG filter type in screenshot: ${filterType}`);
      }
    }

    if (y % sampleStepY === 0) {
      for (let x = 0; x < width; x += sampleStepX) {
        const pixelOffset = x * channels;
        const r = currentRow[pixelOffset];
        const g = colorType === 0 ? r : currentRow[pixelOffset + 1];
        const b = colorType === 0 ? r : currentRow[pixelOffset + 2];
        const a = colorType === 4 ? currentRow[pixelOffset + 1] : colorType === 6 ? currentRow[pixelOffset + 3] : 255;
        uniqueColors.add(`${r},${g},${b},${a}`);
        sampledPixels += 1;
      }
    }

    previousRow.set(currentRow);
  }

  return {
    width,
    height,
    sampledPixels,
    uniqueSampledColors: uniqueColors.size,
    nonBlank: width >= 800 && height >= 500 && uniqueColors.size >= 12,
  };
}

function selfTestScreenshotAnalysis() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chaton screenshot analysis test-'));
  try {
    const blankPath = path.join(tempRoot, 'blank.png');
    const variedPath = path.join(tempRoot, 'varied.png');
    writeTestPng(blankPath, 32, 24, (x, y) => [255, 255, 255, 255]);
    writeTestPng(variedPath, 960, 600, (x, y) => [x % 256, y % 256, (x + y) % 256, 255]);
    const blank = analyzePngScreenshot(blankPath);
    const varied = analyzePngScreenshot(variedPath);
    if (blank.nonBlank) {
      throw new Error('Screenshot analysis self-test treated a blank PNG as nonblank');
    }
    if (!varied.nonBlank) {
      throw new Error(`Screenshot analysis self-test treated a varied PNG as blank: ${JSON.stringify(varied)}`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function writeTestPng(filePath, width, height, pixelAt) {
  const channels = 4;
  const raw = Buffer.alloc(height * (width * channels + 1));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * channels + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelAt(x, y);
      const pixelOffset = rowOffset + 1 + x * channels;
      raw[pixelOffset] = r;
      raw[pixelOffset + 1] = g;
      raw[pixelOffset + 2] = b;
      raw[pixelOffset + 3] = a;
    }
  }

  const chunks = [
    createPngChunk('IHDR', Buffer.from([
      (width >>> 24) & 0xff,
      (width >>> 16) & 0xff,
      (width >>> 8) & 0xff,
      width & 0xff,
      (height >>> 24) & 0xff,
      (height >>> 16) & 0xff,
      (height >>> 8) & 0xff,
      height & 0xff,
      8,
      6,
      0,
      0,
      0,
    ])),
    createPngChunk('IDAT', zlib.deflateSync(raw)),
    createPngChunk('IEND', Buffer.alloc(0)),
  ];
  fs.writeFileSync(filePath, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunks,
  ]));
}

function createPngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function selfTestSqliteSnapshotQuoting() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chaton sqlite quote test'"));
  try {
    const sourceDb = path.join(tempRoot, "source db's.sqlite");
    const targetDb = path.join(tempRoot, "target db's.sqlite");
    execFileSync('sqlite3', [sourceDb, 'CREATE TABLE smoke(value TEXT); INSERT INTO smoke VALUES (\'ok\');'], {
      stdio: 'pipe',
    });
    const snapshot = snapshotSqliteDatabase(sourceDb, targetDb);
    if (snapshot.mode !== 'sqlite-backup') {
      throw new Error(`Expected sqlite-backup snapshot mode, got ${snapshot.mode}`);
    }
    const value = execFileSync('sqlite3', [targetDb, 'SELECT value FROM smoke;'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (value !== 'ok') {
      throw new Error(`Snapshot self-test copied unexpected value: ${value}`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function selfTestSignalCleanup() {
  const childEnv = {
    ...process.env,
    CHATON_ELECTRON_SMOKE_SELF_TEST: 'signal-cleanup-child',
    CHATON_ELECTRON_SMOKE_ISOLATE_USER_DATA: '1',
    CHATON_ELECTRON_SMOKE_KEEP_USER_DATA: '0',
    CHATON_ELECTRON_SMOKE_PROMPT: '',
  };
  const child = spawn(process.execPath, [__filename], {
    cwd: repoRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let isolatedUserData = null;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Timed out waiting for signal cleanup child readiness'));
    }, 10_000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      for (const line of stdout.split('\n')) {
        if (!line.trim()) {
          continue;
        }
        try {
          const event = JSON.parse(line);
          if (event.selfTest === 'signal-cleanup-child' && event.path) {
            isolatedUserData = event.path;
            clearTimeout(timeout);
            child.kill('SIGTERM');
          }
        } catch {
          // Ignore partial or non-JSON output from the child process.
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (!isolatedUserData) {
        reject(new Error(`Signal cleanup child exited before reporting its path. code=${code} signal=${signal} stderr=${stderr}`));
        return;
      }
      if (signal !== 'SIGTERM' && code !== 143) {
        reject(new Error(`Signal cleanup child exited unexpectedly. code=${code} signal=${signal} stderr=${stderr}`));
        return;
      }
      resolve();
    });
  });

  if (fs.existsSync(isolatedUserData)) {
    throw new Error(`Signal cleanup left isolated userData behind: ${isolatedUserData}`);
  }
  return { path: isolatedUserData };
}

function snapshotSqliteDatabase(sourceDb, targetDb) {
  if (!fs.existsSync(sourceDb)) {
    return { mode: 'missing' };
  }

  fs.mkdirSync(path.dirname(targetDb), { recursive: true });
  try {
    execFileSync('sqlite3', [sourceDb, `.backup ${quoteSqliteCliString(targetDb)}`], { stdio: 'pipe' });
    const quickCheck = execFileSync('sqlite3', [targetDb, 'PRAGMA quick_check;'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (quickCheck !== 'ok') {
      throw new Error(`SQLite quick_check failed: ${quickCheck}`);
    }
    return { mode: 'sqlite-backup' };
  } catch (error) {
    for (const fileName of ['chaton.sqlite', 'chaton.sqlite-wal', 'chaton.sqlite-shm']) {
      copyFileIfExists(path.join(path.dirname(sourceDb), fileName), path.join(path.dirname(targetDb), fileName));
    }
    return {
      mode: 'file-copy-fallback',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function prepareIsolatedUserData() {
  if (!shouldIsolateUserData) {
    return null;
  }

  const sourceUserData = process.env.CHATON_SOURCE_USER_DATA_DIR || getDefaultUserDataDir();
  const isolatedUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'chaton-electron-smoke-'));
  const sourceAgentDir = path.join(sourceUserData, '.pi', 'agent');
  const targetAgentDir = path.join(isolatedUserData, '.pi', 'agent');
  const sqliteSnapshot = shouldUseBlankUserData || shouldUseFreshUserData
    ? { mode: shouldUseBlankUserData ? 'blank' : 'fresh' }
    : snapshotSqliteDatabase(
        path.join(sourceUserData, 'chaton.sqlite'),
        path.join(isolatedUserData, 'chaton.sqlite'),
      );

  if (!shouldUseBlankUserData) {
    for (const fileName of ['settings.json', 'models.json', 'auth.json']) {
      copyFileIfExists(path.join(sourceAgentDir, fileName), path.join(targetAgentDir, fileName));
    }
  }

  fs.mkdirSync(path.join(targetAgentDir, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(targetAgentDir, 'worktrees', 'chaton'), { recursive: true });

  return { sourceUserData, isolatedUserData, sqliteSnapshot, fresh: shouldUseFreshUserData, blank: shouldUseBlankUserData };
}

const userDataIsolation = prepareIsolatedUserData();

function cleanupTempUserDataSync() {
  if (!userDataIsolation || keepIsolatedUserData || tempUserDataRemoved) {
    return;
  }
  fs.rmSync(userDataIsolation.isolatedUserData, { recursive: true, force: true });
  tempUserDataRemoved = true;
}

async function cleanupResources() {
  if (cleanupPromise) {
    return cleanupPromise;
  }
  cleanupPromise = (async () => {
    if (app) {
      await closeElectronApp(app).catch((error) => {
        console.warn('[Smoke] failed to close Electron app:', error instanceof Error ? error.message : String(error));
      });
      if (packagedExecutablePattern) {
        await terminateProcessCommands(packagedExecutablePattern).catch((error) => {
          console.warn('[Smoke] failed to terminate packaged app child processes:', error instanceof Error ? error.message : String(error));
        });
      }
      app = null;
    }
    cleanupTempUserDataSync();
  })();
  return cleanupPromise;
}

function signalExitCode(signal) {
  if (signal === 'SIGINT') {
    return 130;
  }
  if (signal === 'SIGTERM') {
    return 143;
  }
  if (signal === 'SIGHUP') {
    return 129;
  }
  return 1;
}

function installProcessCleanupHandlers() {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, () => {
      cleanupResources()
        .catch((error) => {
          console.error(error instanceof Error ? error.stack || error.message : String(error));
        })
        .finally(() => {
          process.exit(signalExitCode(signal));
        });
    });
  }

  process.once('uncaughtException', (error) => {
    console.error(error.stack || error.message);
    cleanupResources().finally(() => process.exit(1));
  });

  process.once('unhandledRejection', (reason) => {
    console.error(reason instanceof Error ? reason.stack || reason.message : String(reason));
    cleanupResources().finally(() => process.exit(1));
  });

  process.once('exit', () => {
    cleanupTempUserDataSync();
  });
}

function isKnownBenignMainProcessLog(text) {
  return /Autofill\.enable|Autofill\.setAddresses|Request Autofill\.|GPU process|passthrough is not supported|crbug\.com|ASR: No room in socket buffer|btm_database\.cc:\d+\] Failed to initialize the DIPS SQLite database/i.test(text);
}

function isMainProcessFailure(text, stream) {
  if (isKnownBenignMainProcessLog(text)) {
    return false;
  }
  if (/\b(ERROR|FATAL)\b|uncaughtException|UnhandledPromiseRejection|unhandledRejection|TypeError:|ReferenceError:|SyntaxError:|Error:/i.test(text)) {
    return true;
  }
  return stream === 'stderr' && /exception|failed|failure|crash|EACCES|ENOENT|SQLITE_CORRUPT/i.test(text);
}

function isRendererInfoConsoleForward(text, stream) {
  return stream === 'stderr' && /\bINFO:CONSOLE:\d+\]/.test(text);
}

function recordMainProcessOutput(stream, chunk) {
  const lines = String(chunk)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const isFailure = isMainProcessFailure(line, stream);
    if (isRendererInfoConsoleForward(line, stream) && !isFailure) {
      continue;
    }
    const entry = { stream, text: line };
    mainProcessLogs.push(entry);
    if (mainProcessLogs.length > maxMainProcessLogEntries) {
      mainProcessLogs.shift();
    }
    if (isFailure) {
      mainProcessFailures.push(entry);
    }
  }
}

function getObservedCurrentVersionMismatches() {
  if (!expectedAppVersion) {
    return [];
  }

  return mainProcessLogs
    .map((entry) => {
      const match = entry.text.match(/Current version:\s*([^,\s]+)/i);
      return match ? { ...entry, observedVersion: match[1] } : null;
    })
    .filter((entry) => entry && entry.observedVersion.replace(/^v/i, '') !== expectedAppVersion.replace(/^v/i, ''));
}

function observeMainProcess(app) {
  const child = app.process();
  child.stdout?.on('data', (chunk) => recordMainProcessOutput('stdout', chunk));
  child.stderr?.on('data', (chunk) => recordMainProcessOutput('stderr', chunk));
}

installProcessCleanupHandlers();

if (process.env.CHATON_ELECTRON_SMOKE_SELF_TEST === 'sqlite-snapshot') {
  selfTestSqliteSnapshotQuoting();
  console.log(JSON.stringify({ ok: true, selfTest: 'sqlite-snapshot' }, null, 2));
  process.exit(0);
}

if (process.env.CHATON_ELECTRON_SMOKE_SELF_TEST === 'screenshot-analysis') {
  selfTestScreenshotAnalysis();
  console.log(JSON.stringify({ ok: true, selfTest: 'screenshot-analysis' }, null, 2));
  process.exit(0);
}

if (process.env.CHATON_ELECTRON_SMOKE_SELF_TEST === 'signal-cleanup') {
  const result = await selfTestSignalCleanup();
  console.log(JSON.stringify({ ok: true, selfTest: 'signal-cleanup', ...result }, null, 2));
  process.exit(0);
}

if (process.env.CHATON_ELECTRON_SMOKE_SELF_TEST === 'signal-cleanup-child') {
  if (!userDataIsolation) {
    throw new Error('signal-cleanup-child requires isolated userData');
  }
  console.log(JSON.stringify({ selfTest: 'signal-cleanup-child', path: userDataIsolation.isolatedUserData }));
  setInterval(() => undefined, 60_000);
  await new Promise(() => undefined);
}

const launchEnv = {
  ...process.env,
  CHATON_ALLOW_AUTOMATION_INSTANCE: '1',
  CHATON_DISABLE_DEVTOOLS: '1',
  ELECTRON_ENABLE_LOGGING: '1',
};
delete launchEnv.CHATON_USER_DATA_DIR;
if (userDataIsolation) {
  launchEnv.CHATON_USER_DATA_DIR = userDataIsolation.isolatedUserData;
}
if (mode === 'dev') {
  launchEnv.VITE_DEV_SERVER_URL = devServerUrl;
} else {
  delete launchEnv.VITE_DEV_SERVER_URL;
}

function resolvePackagedExecutable(appPath) {
  if (process.platform === 'darwin' && appPath.endsWith('.app')) {
    const appName = path.basename(appPath, '.app');
    return path.join(appPath, 'Contents', 'MacOS', appName);
  }
  return appPath;
}

if (process.env.CHATON_ELECTRON_SMOKE_SELF_TEST === 'extension-server-shutdown') {
  const result = await runExtensionServerShutdownSelfTest();
  console.log(JSON.stringify({ ok: true, selfTest: 'extension-server-shutdown', ...result }, null, 2));
  process.exit(0);
}

if (process.env.CHATON_ELECTRON_SMOKE_SELF_TEST === 'dev-server-preflight') {
  const result = await selfTestDevServerPreflight();
  console.log(JSON.stringify({ ok: true, selfTest: 'dev-server-preflight', ...result }, null, 2));
  process.exit(0);
}

function assertExpectedReply(actualText) {
  if (!expectedReply) {
    return;
  }
  const actual = actualText.trim();
  const matches = expectedReplyMode === 'contains'
    ? actual.includes(expectedReply)
    : actual === expectedReply;
  if (!matches) {
    throw new Error(
      `Assistant response did not match expected reply (${expectedReplyMode}) ${JSON.stringify(expectedReply)}. Actual: ${actual.slice(0, 1000)}`,
    );
  }
}

async function getProcessSnapshot(app) {
  return app.evaluate(async ({ app, BrowserWindow }) => ({
    ready: app.isReady(),
    userData: app.getPath('userData'),
    count: BrowserWindow.getAllWindows().length,
    windows: BrowserWindow.getAllWindows().map((win) => ({
      title: win.getTitle(),
      visible: win.isVisible(),
      destroyed: win.isDestroyed(),
      bounds: win.getBounds(),
    })),
  }));
}

async function waitForAppWindow(app, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastSnapshot = await getProcessSnapshot(app);
    } catch (error) {
      lastSnapshot = {
        ready: false,
        count: 0,
        windows: [],
        transientError: error instanceof Error ? error.message : String(error),
      };
      await wait(250);
      continue;
    }
    const pages = app.windows();
    const window = pages.find((page) => !page.url().startsWith('devtools://'));
    if (window) {
      return { window, proc: lastSnapshot };
    }
    await wait(250);
  }

  return { window: null, proc: lastSnapshot ?? await getProcessSnapshot(app) };
}

function observePage(page) {
  if (observedPages.has(page)) {
    return;
  }
  observedPages.add(page);
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.stack || error.message);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    const url = request.url();
    const resourceType = request.resourceType();
    if (
      resourceType === 'media'
      && failure === 'net::ERR_ABORTED'
      && (url.includes('conversation-success-chime-') || url.includes('conversation-success-chime.wav') || url.includes('chaton-hero-'))
    ) {
      return;
    }
    networkFailures.push({
      url,
      method: request.method(),
      failure,
      resourceType,
    });
  });
}

async function clickFirstVisible(page, selectors, label) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 2500 });
      await locator.click();
      return selector;
    } catch {
      // Try the next selector; UI labels can differ between locales/modes.
    }
  }
  throw new Error(`Unable to find visible target for ${label}`);
}

async function getPageDiagnostic(page) {
  const bodyText = await page.locator('body').innerText({ timeout: 1000 }).catch((error) => `body-unavailable: ${error.message}`);
  const visibleButtons = await page.locator('button:visible').evaluateAll((buttons) => buttons
    .slice(0, 30)
    .map((button) => ({
      text: (button.textContent || '').replace(/\s+/g, ' ').trim(),
      ariaLabel: button.getAttribute('aria-label') || '',
      title: button.getAttribute('title') || '',
    }))
  ).catch(() => []);
  return {
    title: await page.title().catch(() => ''),
    url: page.url(),
    bodyText: bodyText.slice(0, 1200),
    visibleButtons,
  };
}

async function clickFirstVisibleWithDiagnostic(page, selectors, label) {
  try {
    return await clickFirstVisible(page, selectors, label);
  } catch (error) {
    const diagnostic = await getPageDiagnostic(page);
    throw new Error(`${error.message}. Page diagnostic: ${JSON.stringify(diagnostic)}`);
  }
}

async function focusFirstVisible(page, selectors, label) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 2500 });
      await locator.focus();
      return selector;
    } catch {
      // Try the next selector; UI labels can differ between locales/modes.
    }
  }
  throw new Error(`Unable to find visible target for ${label}`);
}

async function waitForAnyVisible(page, selectors, label, timeoutMs = 7000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    for (const selector of selectors) {
      try {
        await page.locator(selector).first().waitFor({ state: 'visible', timeout: 500 });
        return selector;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw new Error(`Unable to find visible target for ${label}: ${lastError?.message ?? 'timed out'}`);
}

async function ensureWorkspaceMode(page) {
  const newConversationSelectors = [
    'button.sidebar-item:has-text("Nouvelle conversation")',
    'button.sidebar-item:has-text("New conversation")',
    'button:has-text("Nouvelle conversation")',
    'button:has-text("New conversation")',
  ];
  const hasNewConversationButton = await page.locator(newConversationSelectors.join(',')).first().isVisible().catch(() => false);
  if (hasNewConversationButton) {
    return { switched: false, selector: null };
  }

  const workspaceSelector = await clickFirstVisibleWithDiagnostic(page, [
    '[role="radio"]:has-text("Espace de travail")',
    '[role="radio"]:has-text("Workspace")',
    'button:has-text("Espace de travail")',
    'button:has-text("Workspace")',
  ], 'workspace mode switcher');
  await waitForAnyVisible(page, newConversationSelectors, 'new conversation button after workspace switch', 10_000);
  return { switched: true, selector: workspaceSelector };
}

async function runInteractiveFlow(page) {
  const steps = [];

  steps.push({
    action: 'open-model-picker',
    selector: await focusFirstVisible(page, [
      '.meta-chip:has-text("gpt-5.5")',
      '[role="button"]:has-text("gpt-5.5")',
    ], 'model picker'),
  });
  await page.keyboard.press('Enter');
  await waitForAnyVisible(page, ['[role="menu"][aria-label="Sélecteur de modèle"]'], 'model picker menu');
  await waitForAnyVisible(page, ['.models-menu-item-active:has-text("gpt-5.5")', '.models-menu-item:has-text("gpt-5.5")'], 'selected gpt-5.5 model');

  steps.push({
    action: 'show-all-models',
    selector: await clickFirstVisible(page, [
      'button.models-more-button:has-text("more")',
    ], 'model picker more button'),
  });
  await waitForAnyVisible(page, ['input.models-menu-search'], 'model search input');
  await page.locator('input.models-menu-search').fill('gpt-5.5');
  await waitForAnyVisible(page, ['.models-menu-item:has-text("gpt-5.5")'], 'filtered gpt-5.5 model');
  await page.keyboard.press('Escape');
  await page.locator('[role="menu"][aria-label="Sélecteur de modèle"]').waitFor({ state: 'hidden', timeout: 3000 });

  steps.push({
    action: 'open-settings',
    selector: await clickFirstVisible(page, [
      'button:has-text("Paramètres")',
      'button:has-text("Settings")',
    ], 'settings button'),
  });
  await waitForAnyVisible(page, ['.settings-sidebar', 'text=Paramètres Pi', 'text=Pi Settings'], 'settings panel');

  steps.push({
    action: 'open-model-settings',
    selector: await clickFirstVisible(page, [
      'button:has-text("Modèles")',
      'button:has-text("Models")',
    ], 'models settings button'),
  });
  await waitForAnyVisible(page, ['text=litellm', 'text=Modèles disponibles', 'text=Available Models'], 'models panel');

  steps.push({
    action: 'return-from-settings',
    selector: await clickFirstVisible(page, [
      'button:has-text("Retour")',
      'button:has-text("Back")',
    ], 'settings back button'),
  });
  await waitForAnyVisible(page, ['button:has-text("Paramètres")', 'button:has-text("Settings")'], 'main sidebar settings button');

  steps.push({
    action: 'open-extensions',
    selector: await clickFirstVisible(page, [
      '.sidebar-item:has-text("Extensions")',
      '.menu-row-icon-slot[title="Extensions"]',
      '.menu-row-popover-item:has-text("Extensions")',
    ], 'extensions navigation item'),
  });
  await waitForAnyVisible(page, ['text=Marketplace', 'text=Installées', 'text=Installed'], 'extensions panel', 10_000);

  steps.push({
    action: 'open-installed-extensions',
    selector: await clickFirstVisible(page, [
      'button:has-text("Installées")',
      'button:has-text("Installed")',
    ], 'installed extensions tab'),
  });
  await waitForAnyVisible(page, ['text=Installées', 'text=Installed', 'text=Aucune extension installée', 'text=No extensions installed'], 'installed extensions panel');

  return steps;
}

async function completeOnboardingForAutomation(page) {
  const hasOnboarding = await page.locator('.onboarding-shell').first().isVisible().catch(() => false);
  if (!hasOnboarding) {
    return false;
  }

  const result = await page.evaluate(async () => {
    const api = globalThis.chaton;
    if (!api || typeof api.getInitialState !== 'function' || typeof api.updateSettings !== 'function') {
      return { ok: false, reason: 'chaton-ipc-missing' };
    }
    const state = await api.getInitialState();
    const settings = state?.settings;
    if (!settings || typeof settings !== 'object') {
      return { ok: false, reason: 'settings-missing' };
    }
    await api.updateSettings({
      ...settings,
      hasCompletedOnboarding: true,
      telemetryConsentAnswered: settings.telemetryConsentAnswered ?? false,
    });
    return { ok: true };
  });

  if (!result?.ok) {
    throw new Error(`Unable to complete onboarding for automation: ${result?.reason ?? 'unknown'}`);
  }

  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await ensureWorkspaceMode(page);
  await waitForAnyVisible(page, [
    'button.sidebar-item:has-text("Nouvelle conversation")',
    'button.sidebar-item:has-text("New conversation")',
    'button:has-text("Nouvelle conversation")',
    'button:has-text("New conversation")',
  ], 'main workspace after onboarding', 10_000);
  return true;
}

async function runPromptFlow(page) {
  if (!promptText) {
    return null;
  }

  const completedOnboarding = await completeOnboardingForAutomation(page);
  const workspaceMode = await ensureWorkspaceMode(page);

  await clickFirstVisibleWithDiagnostic(page, [
    'button.sidebar-item:has-text("Nouvelle conversation")',
    'button.sidebar-item:has-text("New conversation")',
    'button:has-text("Nouvelle conversation")',
    'button:has-text("New conversation")',
  ], 'new conversation button');
  await page.locator('textarea.composer-input').first().waitFor({ state: 'visible', timeout: 7000 });

  const textarea = page.locator('textarea.composer-input').first();
  const userMessages = page.locator('article[data-message-role="user"]');
  const assistantMessages = page.locator('article[data-message-role="assistant"]');
  const initialUserCount = await userMessages.count();
  const initialAssistantCount = await assistantMessages.count();

  await textarea.waitFor({ state: 'visible', timeout: 7000 });
  await textarea.fill(promptText);
  await page.locator('button.send-button').last().click();
  await page.waitForFunction(
    ({ count, text }) => {
      const messages = Array.from(document.querySelectorAll('article[data-message-role="user"]'));
      return messages.length > count && (messages.at(-1)?.textContent ?? '').includes(text);
    },
    { count: initialUserCount, text: promptText },
    { timeout: 10_000 },
  );

  const startedAt = Date.now();
  let lastAssistantText = '';
  while (Date.now() - startedAt < promptTimeoutMs) {
    const bodyText = await page.locator('body').innerText({ timeout: 5000 });
    if (/Unable to send message|Impossible d’envoyer|Impossible d'envoyer|authentication failed|access denied|401/i.test(bodyText)) {
      throw new Error('Prompt failed with visible provider/authentication error');
    }
    const assistantCount = await assistantMessages.count();
    if (assistantCount > initialAssistantCount) {
      lastAssistantText = (await assistantMessages.last().innerText({ timeout: 5000 })).trim();
    }
    if (lastAssistantText.length > 0 && !/running|Chargement|Getting ready/i.test(lastAssistantText)) {
      assertExpectedReply(lastAssistantText);
      return {
        promptText,
        expectedReply,
        expectedReplyMode,
        completedOnboarding,
        workspaceMode,
        elapsedMs: Date.now() - startedAt,
        assistantPreview: lastAssistantText.slice(0, 300),
      };
    }
    await wait(1000);
  }

  throw new Error(`Timed out waiting for prompt response after ${promptTimeoutMs}ms. Last assistant text: ${lastAssistantText.slice(0, 1000)}`);
}

try {
  const launchTarget = mode === 'app' ? resolvePackagedExecutable(packagedAppPath) : electronMain;
  if (mode === 'app' && !fs.existsSync(launchTarget)) {
    throw new Error(`Packaged app executable not found: ${launchTarget}`);
  }
  if (mode === 'dev') {
    await ensureDevRendererAvailable(devServerUrl, 15_000);
  }
  packagedExecutablePattern = mode === 'app' ? launchTarget : null;

  app = await electron.launch({
    executablePath: mode === 'app' ? launchTarget : undefined,
    args: mode === 'app' ? [] : [electronMain],
    cwd: repoRoot,
    env: launchEnv,
  });
  observeMainProcess(app);

  app.on('window', observePage);
  for (const page of app.windows()) {
    observePage(page);
  }

  const { window, proc } = await waitForAppWindow(app);
  const pages = app.windows();
  const summaries = [];
  for (const page of pages) {
    observePage(page);
    summaries.push({ title: await page.title(), url: page.url() });
  }
  if (!window) {
    console.log(JSON.stringify({ error: 'app-window-not-found', pages: summaries, proc }, null, 2));
    process.exitCode = 1;
  } else {
    observePage(window);
    await window.setViewportSize({ width: 1440, height: 960 });
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(1500);
    const selectedUrl = window.url();
    fs.mkdirSync(screenshotDir, { recursive: true });
    const body = window.locator('body');
    const bodyText = ((await body.innerText({ timeout: 5000 })) || '').slice(0, 1000);
    const onboardingInitiallyVisible = bodyText.includes('Welcome to Chatons')
      || await window.locator('.onboarding-shell').first().isVisible().catch(() => false);
    const promptResult = await runPromptFlow(window);
    const onboardingCompletedForAutomation = promptResult?.completedOnboarding === true;
    const onboardingVisible = onboardingInitiallyVisible || onboardingCompletedForAutomation;
    const interactiveSteps = flow === 'interactive' ? await runInteractiveFlow(window) : [];
    await window.waitForTimeout(500);
    const finalBodyText = ((await body.innerText({ timeout: 5000 })) || '').slice(0, 1500);
    const expectedModelNeedles = getExpectedModelNeedles(expectedModel);
    const expectedModelVisible = expectedModel
      ? expectedModelNeedles.some((needle) => bodyText.includes(needle))
        || expectedModelNeedles.some((needle) => finalBodyText.includes(needle))
        || interactiveSteps.some((step) => (
          typeof step.selector === 'string'
          && expectedModelNeedles.some((needle) => step.selector.includes(needle))
        ))
      : undefined;
    const screenshotPath = path.join(screenshotDir, 'electron-smoke.png');
    await window.screenshot({ path: screenshotPath });
    const screenshotAnalysis = analyzePngScreenshot(screenshotPath);
    const appVersionMismatches = getObservedCurrentVersionMismatches();

    if (selectedUrl.startsWith('chrome-error://')) {
      process.exitCode = 1;
    }
    if (consoleErrors.length > 0) {
      process.exitCode = 1;
    }
    if (networkFailures.length > 0) {
      process.exitCode = 1;
    }
    if (mainProcessFailures.length > 0) {
      process.exitCode = 1;
    }
    if (expectedModel && !expectedModelVisible) {
      process.exitCode = 1;
    }
    if (userDataIsolation && proc?.userData !== userDataIsolation.isolatedUserData) {
      process.exitCode = 1;
    }
    if (appVersionMismatches.length > 0) {
      process.exitCode = 1;
    }
    if (shouldExpectOnboarding && !onboardingVisible) {
      process.exitCode = 1;
    }
    if (!screenshotAnalysis.nonBlank) {
      process.exitCode = 1;
    }

    console.log(JSON.stringify({
      error: selectedUrl.startsWith('chrome-error://')
        ? 'renderer-load-failed'
        : expectedModel && !expectedModelVisible
          ? 'expected-model-not-visible'
          : userDataIsolation && proc?.userData !== userDataIsolation.isolatedUserData
            ? 'isolated-user-data-not-used'
          : appVersionMismatches.length > 0
            ? 'app-version-mismatch'
          : shouldExpectOnboarding && !onboardingVisible
            ? 'expected-onboarding-not-visible'
          : !screenshotAnalysis.nonBlank
            ? 'screenshot-blank-or-too-simple'
          : undefined,
      mode,
      flow,
      userData: userDataIsolation
        ? {
            isolated: true,
            path: userDataIsolation.isolatedUserData,
            source: userDataIsolation.sourceUserData,
            fresh: userDataIsolation.fresh,
            blank: userDataIsolation.blank,
            sqliteSnapshot: userDataIsolation.sqliteSnapshot,
          }
        : { isolated: false },
      selected: { title: await window.title(), url: selectedUrl },
      pages: summaries,
      proc,
      expectedModel,
      expectedModelNeedles,
      expectedModelVisible,
      expectedAppVersion,
      appVersionMismatches,
      shouldExpectOnboarding,
      onboardingInitiallyVisible,
      onboardingCompletedForAutomation,
      onboardingVisible,
      screenshot: {
        path: screenshotPath,
        ...screenshotAnalysis,
      },
      interactiveSteps,
      promptResult,
      bodyText,
      finalBodyText,
      consoleErrors,
      networkFailures,
      mainProcessFailures,
      mainProcessLogs,
    }, null, 2));
  }
} finally {
  await cleanupResources();
}
