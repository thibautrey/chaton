import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const dmgPath = path.resolve(process.env.CHATON_DMG_SMOKE_DMG_PATH ?? path.join(repoRoot, 'release', 'Chatons-latest-arm64.dmg'));
const isDryRun = process.env.CHATON_DMG_SMOKE_DRY_RUN === '1';
const selfTest = process.env.CHATON_DMG_SMOKE_SELF_TEST?.trim() || null;
const hasExplicitExpectedModel = Object.prototype.hasOwnProperty.call(process.env, 'CHATON_EXPECTED_MODEL');
const defaultExpectedModel = 'litellm/gpt-5.5';
const expectedModel = hasExplicitExpectedModel ? process.env.CHATON_EXPECTED_MODEL?.trim() ?? '' : defaultExpectedModel;
const shouldUseBlankUserData = process.env.CHATON_ELECTRON_SMOKE_BLANK_USER_DATA === '1';
const expectedModelForSmoke = !shouldUseBlankUserData || hasExplicitExpectedModel ? expectedModel : null;
const shouldInstallCopy = process.env.CHATON_DMG_SMOKE_INSTALL_COPY === '1';

const inheritedElectronEnvToClear = [
  'CHATON_ALLOW_AUTOMATION_INSTANCE',
  'CHATON_DISABLE_DEVTOOLS',
  'CHATON_ELECTRON_SMOKE_EXPECT_ONBOARDING',
  'CHATON_ELECTRON_SMOKE_EXPECTED_REPLY',
  'CHATON_ELECTRON_SMOKE_EXPECTED_REPLY_MODE',
  'CHATON_ELECTRON_SMOKE_ISOLATE_USER_DATA',
  'CHATON_ELECTRON_SMOKE_KEEP_USER_DATA',
  'CHATON_ELECTRON_SMOKE_PROMPT',
  'CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS',
  'CHATON_ELECTRON_SMOKE_SELF_TEST',
  'CHATON_EXPECTED_APP_VERSION',
  'CHATON_SMOKE_EXTENSION_PORT',
  'CHATON_SMOKE_IGNORE_SIGTERM',
  'CHATON_SOURCE_USER_DATA_DIR',
  'CHATON_USER_DATA_DIR',
];
const orchestratedPromptEnvKeys = [
  'CHATON_ELECTRON_SMOKE_EXPECTED_REPLY',
  'CHATON_ELECTRON_SMOKE_EXPECTED_REPLY_MODE',
  'CHATON_ELECTRON_SMOKE_PROMPT',
  'CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS',
];

function buildSmokeEnv(appPath, sourceEnv = process.env) {
  const hasExplicitModel = Object.prototype.hasOwnProperty.call(sourceEnv, 'CHATON_EXPECTED_MODEL');
  const sourceExpectedModel = hasExplicitModel ? sourceEnv.CHATON_EXPECTED_MODEL?.trim() ?? '' : defaultExpectedModel;
  const sourceUsesBlankUserData = sourceEnv.CHATON_ELECTRON_SMOKE_BLANK_USER_DATA === '1';
  const sourceExpectedModelForSmoke = !sourceUsesBlankUserData || hasExplicitModel ? sourceExpectedModel : null;
  const childEnv = {
    ...sourceEnv,
    CHATON_ELECTRON_SMOKE_APP_PATH: appPath,
    CHATON_ELECTRON_SMOKE_MODE: 'app',
    CHATON_ELECTRON_SMOKE_FLOW: sourceEnv.CHATON_ELECTRON_SMOKE_FLOW ?? 'startup',
  };
  for (const key of inheritedElectronEnvToClear) {
    delete childEnv[key];
  }
  if (sourceEnv.CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT === '1') {
    for (const key of orchestratedPromptEnvKeys) {
      if (Object.prototype.hasOwnProperty.call(sourceEnv, key)) {
        childEnv[key] = sourceEnv[key];
      }
    }
  }
  delete childEnv.CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT;
  if (sourceExpectedModelForSmoke) {
    childEnv.CHATON_EXPECTED_MODEL = sourceExpectedModelForSmoke;
  } else {
    delete childEnv.CHATON_EXPECTED_MODEL;
  }
  return childEnv;
}

function summarizeSmokeEnv(appPath, sourceEnv = process.env) {
  const childEnv = buildSmokeEnv(appPath, sourceEnv);
  const keys = [
    'CHATON_ELECTRON_SMOKE_APP_PATH',
    'CHATON_ELECTRON_SMOKE_BLANK_USER_DATA',
    'CHATON_ELECTRON_SMOKE_EXPECT_ONBOARDING',
    'CHATON_ELECTRON_SMOKE_EXPECTED_REPLY',
    'CHATON_ELECTRON_SMOKE_EXPECTED_REPLY_MODE',
    'CHATON_ELECTRON_SMOKE_FLOW',
    'CHATON_ELECTRON_SMOKE_FRESH_USER_DATA',
    'CHATON_ELECTRON_SMOKE_ISOLATE_USER_DATA',
    'CHATON_ELECTRON_SMOKE_KEEP_USER_DATA',
    'CHATON_ELECTRON_SMOKE_MODE',
    'CHATON_ELECTRON_SMOKE_PROMPT',
    'CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS',
    'CHATON_ELECTRON_SMOKE_SELF_TEST',
    'CHATON_EXPECTED_APP_VERSION',
    'CHATON_EXPECTED_MODEL',
    'CHATON_SMOKE_EXTENSION_PORT',
    'CHATON_SMOKE_IGNORE_SIGTERM',
    'CHATON_SOURCE_USER_DATA_DIR',
    'CHATON_USER_DATA_DIR',
  ];
  return Object.fromEntries(
    keys
      .filter((key) => Object.prototype.hasOwnProperty.call(childEnv, key))
      .map((key) => [key, childEnv[key]]),
  );
}

function assertSelfTest(condition, message) {
  if (!condition) {
    throw new Error(`DMG smoke self-test failed: ${message}`);
  }
}

function runEnvSelfTest() {
  const appPath = '/tmp/Chatons.app';
  const blankWithEmptyModel = summarizeSmokeEnv(appPath, {
    CHATON_ELECTRON_SMOKE_BLANK_USER_DATA: '1',
    CHATON_EXPECTED_MODEL: '',
  });
  const blankWithoutModel = summarizeSmokeEnv(appPath, {
    CHATON_ELECTRON_SMOKE_BLANK_USER_DATA: '1',
  });
  const blankWithExplicitModel = summarizeSmokeEnv(appPath, {
    CHATON_ELECTRON_SMOKE_BLANK_USER_DATA: '1',
    CHATON_EXPECTED_MODEL: 'litellm/custom',
  });
  const defaultEnv = summarizeSmokeEnv(appPath, {});
  const pollutedEnv = summarizeSmokeEnv(appPath, {
    CHATON_ELECTRON_SMOKE_APP_PATH: '/tmp/Bad.app',
    CHATON_ELECTRON_SMOKE_EXPECT_ONBOARDING: '1',
    CHATON_ELECTRON_SMOKE_EXPECTED_REPLY: 'leak',
    CHATON_ELECTRON_SMOKE_EXPECTED_REPLY_MODE: 'contains',
    CHATON_ELECTRON_SMOKE_ISOLATE_USER_DATA: '1',
    CHATON_ELECTRON_SMOKE_KEEP_USER_DATA: '1',
    CHATON_ELECTRON_SMOKE_MODE: 'file',
    CHATON_ELECTRON_SMOKE_PROMPT: 'leak',
    CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS: '1',
    CHATON_ELECTRON_SMOKE_SELF_TEST: 'sqlite-snapshot',
    CHATON_EXPECTED_APP_VERSION: '9.9.9',
    CHATON_SMOKE_EXTENSION_PORT: '1',
    CHATON_SMOKE_IGNORE_SIGTERM: '1',
    CHATON_SOURCE_USER_DATA_DIR: '/tmp/bad-source-user-data',
    CHATON_USER_DATA_DIR: '/tmp/bad-user-data',
  });
  const orchestratedPromptEnv = summarizeSmokeEnv(appPath, {
    CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT: '1',
    CHATON_ELECTRON_SMOKE_EXPECTED_REPLY: 'allowed',
    CHATON_ELECTRON_SMOKE_EXPECTED_REPLY_MODE: 'contains',
    CHATON_ELECTRON_SMOKE_PROMPT: 'allowed prompt',
    CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS: '1234',
    CHATON_ELECTRON_SMOKE_SELF_TEST: 'sqlite-snapshot',
  });

  assertSelfTest(!Object.prototype.hasOwnProperty.call(blankWithEmptyModel, 'CHATON_EXPECTED_MODEL'), 'explicit empty expected model should not pass an empty model assertion');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(blankWithoutModel, 'CHATON_EXPECTED_MODEL'), 'blank userData without explicit expected model should not pass a model assertion');
  assertSelfTest(blankWithExplicitModel.CHATON_EXPECTED_MODEL === 'litellm/custom', 'blank userData with explicit expected model should preserve it');
  assertSelfTest(defaultEnv.CHATON_EXPECTED_MODEL === defaultExpectedModel, `default smoke should assert ${defaultExpectedModel}`);
  assertSelfTest(defaultEnv.CHATON_ELECTRON_SMOKE_MODE === 'app', 'default smoke mode should be app');
  assertSelfTest(defaultEnv.CHATON_ELECTRON_SMOKE_FLOW === 'startup', 'default smoke flow should be startup');
  assertSelfTest(pollutedEnv.CHATON_ELECTRON_SMOKE_APP_PATH === appPath, 'DMG smoke should force the mounted app path');
  assertSelfTest(pollutedEnv.CHATON_ELECTRON_SMOKE_MODE === 'app', 'DMG smoke should force app mode');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(pollutedEnv, 'CHATON_ELECTRON_SMOKE_PROMPT'), 'electron prompt should not be inherited by DMG smoke');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(pollutedEnv, 'CHATON_ELECTRON_SMOKE_EXPECTED_REPLY'), 'electron expected reply should not be inherited by DMG smoke');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(pollutedEnv, 'CHATON_ELECTRON_SMOKE_SELF_TEST'), 'electron self-test should not be inherited by DMG smoke');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(pollutedEnv, 'CHATON_ELECTRON_SMOKE_EXPECT_ONBOARDING'), 'electron onboarding expectation should not be inherited by DMG smoke');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(pollutedEnv, 'CHATON_ELECTRON_SMOKE_ISOLATE_USER_DATA'), 'electron isolate-userData flag should not be inherited by DMG smoke');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(pollutedEnv, 'CHATON_ELECTRON_SMOKE_KEEP_USER_DATA'), 'electron keep-userData flag should not be inherited by DMG smoke');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(pollutedEnv, 'CHATON_EXPECTED_APP_VERSION'), 'expected app version override should not be inherited by DMG smoke');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(pollutedEnv, 'CHATON_SMOKE_EXTENSION_PORT'), 'extension fixture port should not be inherited by DMG smoke');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(pollutedEnv, 'CHATON_SMOKE_IGNORE_SIGTERM'), 'extension fixture signal override should not be inherited by DMG smoke');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(pollutedEnv, 'CHATON_SOURCE_USER_DATA_DIR'), 'source userData override should not be inherited by DMG smoke');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(pollutedEnv, 'CHATON_USER_DATA_DIR'), 'launch userData override should not be inherited by DMG smoke');
  assertSelfTest(orchestratedPromptEnv.CHATON_ELECTRON_SMOKE_PROMPT === 'allowed prompt', 'orchestrated electron prompt should be forwarded');
  assertSelfTest(orchestratedPromptEnv.CHATON_ELECTRON_SMOKE_EXPECTED_REPLY === 'allowed', 'orchestrated expected reply should be forwarded');
  assertSelfTest(orchestratedPromptEnv.CHATON_ELECTRON_SMOKE_EXPECTED_REPLY_MODE === 'contains', 'orchestrated expected reply mode should be forwarded');
  assertSelfTest(orchestratedPromptEnv.CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS === '1234', 'orchestrated prompt timeout should be forwarded');
  assertSelfTest(!Object.prototype.hasOwnProperty.call(orchestratedPromptEnv, 'CHATON_ELECTRON_SMOKE_SELF_TEST'), 'electron self-test should never be forwarded by prompt allowance');

  console.log(JSON.stringify({ ok: true, selfTest, cases: { blankWithEmptyModel, blankWithoutModel, blankWithExplicitModel, defaultEnv, pollutedEnv, orchestratedPromptEnv } }, null, 2));
}

function parseMountedVolume(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.toReversed()) {
    const match = line.match(/\s(\/Volumes\/.+)$/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

async function runSmoke(appPath) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/qa/electron-smoke.mjs'], {
      cwd: repoRoot,
      env: buildSmokeEnv(appPath),
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`DMG smoke failed. code=${code} signal=${signal ?? 'none'}`));
    });
  });
}

async function copyInstalledApp(sourceAppPath, options = {}) {
  const copyApp = options.copyApp ?? execFileAsync;
  const createInstallRoot = options.createInstallRoot ?? (() => fs.mkdtempSync(path.join(os.tmpdir(), 'chaton-dmg-install-')));
  const installRoot = createInstallRoot();
  const installedAppPath = path.join(installRoot, 'Chatons.app');
  try {
    await copyApp('ditto', [sourceAppPath, installedAppPath]);
    return { installRoot, installedAppPath };
  } catch (error) {
    fs.rmSync(installRoot, { recursive: true, force: true });
    throw error;
  }
}

async function runInstallCopyCleanupSelfTest() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chaton-dmg-install-cleanup-self-test-'));
  let createdInstallRoot = null;
  try {
    let sawExpectedCopyArgs = false;
    let failed = false;
    try {
      await copyInstalledApp('/tmp/Source Chatons.app', {
        createInstallRoot: () => {
          createdInstallRoot = fs.mkdtempSync(path.join(fixtureRoot, 'install-'));
          return createdInstallRoot;
        },
        copyApp: async (command, args) => {
          sawExpectedCopyArgs = command === 'ditto'
            && args[0] === '/tmp/Source Chatons.app'
            && args[1] === path.join(createdInstallRoot, 'Chatons.app');
          fs.mkdirSync(path.join(createdInstallRoot, 'partial-copy'), { recursive: true });
          throw new Error('simulated ditto failure');
        },
      });
    } catch (error) {
      failed = error instanceof Error && error.message === 'simulated ditto failure';
    }
    assertSelfTest(sawExpectedCopyArgs, 'copy command should receive the expected source and install destination');
    assertSelfTest(failed, 'copy failure should be propagated');
    assertSelfTest(createdInstallRoot !== null, 'self-test should create an install root');
    assertSelfTest(!fs.existsSync(createdInstallRoot), 'failed installed-copy temp root should be removed');
    console.log(JSON.stringify({ ok: true, selfTest, createdInstallRoot, cleaned: true }, null, 2));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function verifyMacSignature(appPath) {
  if (process.platform !== 'darwin') {
    return { skipped: true, reason: 'not-darwin' };
  }

  const codesign = await execFileAsync('codesign', ['-dv', '--verbose=4', appPath]);
  const codesignOutput = `${codesign.stdout}${codesign.stderr}`;
  const authorityLines = codesignOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('Authority='));

  if (!/flags=.*\bruntime\b/.test(codesignOutput)) {
    throw new Error(`Packaged app is not signed with hardened runtime:\n${codesignOutput}`);
  }

  if (authorityLines.length === 0) {
    throw new Error(`Packaged app signature has no authority chain:\n${codesignOutput}`);
  }

  const spctl = await execFileAsync('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]);
  const spctlOutput = `${spctl.stdout}${spctl.stderr}`;
  if (!/accepted/i.test(spctlOutput)) {
    throw new Error(`Gatekeeper assessment did not accept packaged app:\n${spctlOutput}`);
  }

  return {
    skipped: false,
    authority: authorityLines.map((line) => line.slice('Authority='.length)),
    gatekeeper: spctlOutput.trim(),
  };
}

if (selfTest === 'env') {
  runEnvSelfTest();
  process.exit(0);
}

if (selfTest === 'install-copy-cleanup') {
  await runInstallCopyCleanupSelfTest();
  process.exit(0);
}

if (selfTest) {
  throw new Error(`Unknown DMG smoke self-test: ${selfTest}`);
}

if (isDryRun) {
  const plannedAppPath = shouldInstallCopy
    ? path.join(os.tmpdir(), 'chaton-dmg-install-DRY-RUN', 'Chatons.app')
    : '/Volumes/Chatons DRY-RUN/Chatons.app';
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    dmgPath,
    installedCopy: shouldInstallCopy,
    expectedModel: expectedModelForSmoke,
    smokeEnv: summarizeSmokeEnv(plannedAppPath),
  }, null, 2));
  process.exit(0);
}

if (!fs.existsSync(dmgPath)) {
  throw new Error(`DMG not found: ${dmgPath}`);
}

const dmgStat = fs.statSync(dmgPath);

let volumePath = null;
let installRoot = null;
let detachedVolumePath = null;
let removedInstallRoot = null;
try {
  const { stdout } = await execFileAsync('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly']);
  volumePath = parseMountedVolume(stdout);
  if (!volumePath) {
    throw new Error(`Unable to determine mounted volume from hdiutil output:\n${stdout}`);
  }

  const appPath = path.join(volumePath, 'Chatons.app');
  if (!fs.existsSync(appPath)) {
    throw new Error(`Mounted DMG does not contain Chatons.app at ${appPath}`);
  }

  let targetAppPath = appPath;
  if (shouldInstallCopy) {
    const installed = await copyInstalledApp(appPath);
    installRoot = installed.installRoot;
    targetAppPath = installed.installedAppPath;
  }

  const signature = await verifyMacSignature(targetAppPath);

  if (shouldInstallCopy && volumePath) {
    detachedVolumePath = volumePath;
    await execFileAsync('hdiutil', ['detach', volumePath]);
    volumePath = null;
  }

  await runSmoke(targetAppPath);

  if (volumePath) {
    detachedVolumePath = volumePath;
    await execFileAsync('hdiutil', ['detach', volumePath]);
    volumePath = null;
  }

  if (installRoot) {
    removedInstallRoot = installRoot;
    fs.rmSync(installRoot, { recursive: true, force: true });
    installRoot = null;
  }

  console.log(JSON.stringify({
    ok: true,
    dmgPath,
    dmg: {
      sizeBytes: dmgStat.size,
      modifiedAt: dmgStat.mtime.toISOString(),
    },
    volumePath,
    detachedVolumePath,
    sourceAppPath: appPath,
    appPath: targetAppPath,
    installedCopy: shouldInstallCopy,
    installRoot,
    removedInstallRoot,
    expectedModel: expectedModelForSmoke,
    signature,
  }, null, 2));
} finally {
  if (volumePath) {
    detachedVolumePath = volumePath;
    await execFileAsync('hdiutil', ['detach', volumePath]).catch((error) => {
      console.error(`Failed to detach ${volumePath}:`, error instanceof Error ? error.message : String(error));
    });
  }
  if (installRoot) {
    removedInstallRoot = installRoot;
    fs.rmSync(installRoot, { recursive: true, force: true });
    installRoot = null;
  }
}
