import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempRoot = process.env.CHATON_QA_TEMP_ROOT ?? os.tmpdir();
const allowCurrentProcessMatches = process.env.CHATON_QA_HYGIENE_ALLOW_SELF === '1';
const selfTest = process.env.CHATON_QA_HYGIENE_SELF_TEST?.trim() || null;
const processPatterns = [
  'Chatons.app',
  'qa:electron-smoke',
  'electron-smoke.mjs',
  'release/mac-arm64',
  '/Volumes/Chatons',
  'dist-electron/electron/main',
  'chaton-dmg-install-',
  'chaton-electron-smoke-',
];
const tempLeakPrefixes = [
  'chaton-build-output-self-test-',
  'chaton-dmg-install-',
  'chaton-dmg-install-cleanup-self-test-',
  'chaton-electron-smoke-',
  'chaton-hygiene-self-test-',
  'chaton-qa-manifest-',
  'chaton-qa-manifest-self-test-',
  'chaton-release-metadata-self-test-',
  'chaton screenshot analysis test-',
  "chaton sqlite quote test'",
];

function isProcessLeak(entry, currentPid = process.pid, allowSelfMatches = allowCurrentProcessMatches) {
  if (entry.pid === currentPid || entry.ppid === currentPid) {
    return false;
  }
  if (allowSelfMatches && entry.command.includes('hygiene-smoke.mjs')) {
    return false;
  }
  return processPatterns.some((pattern) => entry.command.includes(pattern));
}

function parsePs(stdout) {
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/);
      if (!match) {
        return null;
      }
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        stat: match[3],
        elapsed: match[4],
        command: match[5],
      };
    })
    .filter(Boolean);
}

async function findProcessLeaks() {
  const { stdout } = await execFileAsync('ps', ['-axo', 'pid,ppid,stat,etime,command'], { encoding: 'utf8' });
  return parsePs(stdout).filter((entry) => isProcessLeak(entry));
}

async function findMountedChatonsVolumes() {
  if (process.platform !== 'darwin') {
    return [];
  }
  const { stdout } = await execFileAsync('hdiutil', ['info'], { encoding: 'utf8' });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('Chatons') || line.includes('/Volumes/Chatons'));
}

function findTempLeaks(root = tempRoot) {
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => tempLeakPrefixes.some((prefix) => name.startsWith(prefix)))
    .map((name) => path.join(root, name));
}

function extractStaticTempPrefix(value) {
  const dynamicStart = value.indexOf('${');
  const prefix = dynamicStart === -1 ? value : value.slice(0, dynamicStart);
  return prefix.startsWith('chaton') ? prefix : null;
}

function findQaTempRootPrefixes(root = __dirname) {
  const prefixes = new Set();
  for (const fileName of fs.readdirSync(root)) {
    if (!fileName.endsWith('.mjs')) {
      continue;
    }
    const source = fs.readFileSync(path.join(root, fileName), 'utf8');
    const pattern = /mkdtempSync\(\s*path\.join\(\s*os\.tmpdir\(\)\s*,\s*(['"`])([\s\S]*?)\1\s*\)\s*\)/g;
    for (const match of source.matchAll(pattern)) {
      const prefix = extractStaticTempPrefix(match[2]);
      if (prefix) {
        prefixes.add(prefix);
      }
    }
  }
  return [...prefixes].sort();
}

function assertSelfTest(condition, message) {
  if (!condition) {
    throw new Error(`hygiene-smoke self-test failed: ${message}`);
  }
}

function runFixtureSelfTest() {
  const discoveredPrefixes = findQaTempRootPrefixes();
  const missingPrefixes = discoveredPrefixes.filter((prefix) => !tempLeakPrefixes.includes(prefix));
  assertSelfTest(missingPrefixes.length === 0, `tempLeakPrefixes is missing QA temp prefixes: ${missingPrefixes.join(', ')}`);

  const psFixture = `  PID  PPID STAT     ELAPSED COMMAND\n    1     0 Ss       01:00:00 /sbin/launchd\n  100     1 S        00:00:03 node scripts/qa/electron-smoke.mjs\n  101   999 S        00:00:01 node scripts/qa/hygiene-smoke.mjs\n  102   200 S        00:00:01 /Applications/Chatons.app/Contents/MacOS/Chatons\n  103   200 S        00:00:01 node unrelated.js\n`;
  const parsed = parsePs(psFixture);
  assertSelfTest(parsed.length === 5, `expected 5 parsed ps rows, got ${parsed.length}`);
  const leaks = parsed.filter((entry) => isProcessLeak(entry, 999, true));
  assertSelfTest(leaks.length === 2, `expected 2 process leaks, got ${leaks.length}`);
  assertSelfTest(leaks.some((entry) => entry.command.includes('electron-smoke.mjs')), 'missing electron-smoke process leak');
  assertSelfTest(leaks.some((entry) => entry.command.includes('Chatons.app')), 'missing Chatons.app process leak');
  assertSelfTest(!leaks.some((entry) => entry.command.includes('hygiene-smoke.mjs')), 'self hygiene process was reported as leak');

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chaton-hygiene-self-test-'));
  try {
    for (const prefix of tempLeakPrefixes) {
      fs.mkdirSync(path.join(fixtureRoot, `${prefix}fixture`));
    }
    fs.mkdirSync(path.join(fixtureRoot, 'unrelated-fixture'));
    fs.writeFileSync(path.join(fixtureRoot, 'chaton-electron-smoke-file'), 'not a directory');
    const tempLeaks = findTempLeaks(fixtureRoot).map((item) => path.basename(item)).sort();
    const expectedTempLeaks = tempLeakPrefixes.map((prefix) => `${prefix}fixture`).sort();
    assertSelfTest(JSON.stringify(tempLeaks) === JSON.stringify(expectedTempLeaks), `unexpected temp leaks: ${tempLeaks.join(', ')}`);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ ok: true, selfTest: 'fixtures', parsedRows: parsed.length, processLeaks: leaks.length, tempPrefixes: discoveredPrefixes.length }, null, 2));
}

if (selfTest === 'fixtures') {
  runFixtureSelfTest();
  process.exit(0);
}

if (selfTest) {
  throw new Error(`Unknown hygiene smoke self-test: ${selfTest}`);
}

const [processLeaks, mountedVolumes] = await Promise.all([
  findProcessLeaks(),
  findMountedChatonsVolumes(),
]);
const tempLeaks = findTempLeaks();
const ok = processLeaks.length === 0 && mountedVolumes.length === 0 && tempLeaks.length === 0;

console.log(JSON.stringify({
  ok,
  tempRoot,
  processLeaks,
  mountedVolumes,
  tempLeaks,
}, null, 2));

if (!ok) {
  process.exit(1);
}
