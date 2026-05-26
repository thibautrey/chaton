import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const isFull = process.env.CHATON_MAC_RELEASE_SMOKE_FULL === '1';
const isDryRun = process.env.CHATON_MAC_RELEASE_SMOKE_DRY_RUN === '1';
const selfTest = process.env.CHATON_MAC_RELEASE_SMOKE_SELF_TEST?.trim() || null;
const defaultExpectedModel = 'litellm/gpt-5.5';
const expectedModel = process.env.CHATON_EXPECTED_MODEL?.trim() || defaultExpectedModel;

function step(name, args, env = {}, unsetEnv = []) {
  return { name, args, env, unsetEnv };
}

const inheritedSmokeEnvToClear = [
  'CHATON_ALLOW_AUTOMATION_INSTANCE',
  'CHATON_DISABLE_DEVTOOLS',
  'CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT',
  'CHATON_DMG_SMOKE_DMG_PATH',
  'CHATON_DMG_SMOKE_DRY_RUN',
  'CHATON_DMG_SMOKE_INSTALL_COPY',
  'CHATON_DMG_SMOKE_SELF_TEST',
  'CHATON_ELECTRON_SMOKE_APP_PATH',
  'CHATON_ELECTRON_SMOKE_BLANK_USER_DATA',
  'CHATON_ELECTRON_SMOKE_CLOSE_TIMEOUT_MS',
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
  'CHATON_RELEASE_METADATA_SMOKE_SELF_TEST',
  'CHATON_RELEASE_DIR',
  'CHATON_RELEASE_METADATA_PATH',
  'CHATON_SMOKE_EXTENSION_PORT',
  'CHATON_SMOKE_IGNORE_SIGTERM',
  'CHATON_SOURCE_USER_DATA_DIR',
  'CHATON_USER_DATA_DIR',
];

const steps = [
  step('release metadata', ['scripts/qa/release-metadata-smoke.mjs'], {}, ['CHATON_EXPECTED_MODEL']),
  step('mounted DMG startup smoke', ['scripts/qa/dmg-smoke.mjs'], {
    CHATON_EXPECTED_MODEL: expectedModel,
  }),
  step('installed-copy DMG startup smoke', ['scripts/qa/dmg-smoke.mjs'], {
    CHATON_DMG_SMOKE_INSTALL_COPY: '1',
    CHATON_EXPECTED_MODEL: expectedModel,
  }),
];

if (isFull) {
  steps.push(
    step('installed-copy DMG interactive smoke', ['scripts/qa/dmg-smoke.mjs'], {
      CHATON_DMG_SMOKE_INSTALL_COPY: '1',
      CHATON_EXPECTED_MODEL: expectedModel,
      CHATON_ELECTRON_SMOKE_FLOW: 'interactive',
    }),
    step('installed-copy DMG blank-userData onboarding smoke', ['scripts/qa/dmg-smoke.mjs'], {
      CHATON_DMG_SMOKE_INSTALL_COPY: '1',
      CHATON_ELECTRON_SMOKE_BLANK_USER_DATA: '1',
    }, ['CHATON_EXPECTED_MODEL']),
    step('installed-copy DMG prompt smoke', ['scripts/qa/dmg-smoke.mjs'], {
      CHATON_DMG_SMOKE_INSTALL_COPY: '1',
      CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT: '1',
      CHATON_ELECTRON_SMOKE_FRESH_USER_DATA: '1',
      CHATON_EXPECTED_MODEL: expectedModel,
      CHATON_ELECTRON_SMOKE_PROMPT: 'Reponds exactement: OK_CHATON_RELEASE_SMOKE',
      CHATON_ELECTRON_SMOKE_EXPECTED_REPLY: 'OK_CHATON_RELEASE_SMOKE',
    }),
  );
}

function buildChildEnv(current) {
  const childEnv = { ...process.env };
  for (const key of inheritedSmokeEnvToClear) {
    delete childEnv[key];
  }
  childEnv.CHATON_ELECTRON_SMOKE_CLOSE_TIMEOUT_MS = '3000';
  for (const key of current.unsetEnv) {
    delete childEnv[key];
  }
  Object.assign(childEnv, current.env);
  return childEnv;
}

function summarizeStepEnv(current) {
  const childEnv = buildChildEnv(current);
  const keys = [
    'CHATON_DMG_SMOKE_INSTALL_COPY',
    'CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT',
    'CHATON_DMG_SMOKE_DMG_PATH',
    'CHATON_DMG_SMOKE_DRY_RUN',
    'CHATON_DMG_SMOKE_SELF_TEST',
    'CHATON_ELECTRON_SMOKE_APP_PATH',
    'CHATON_ELECTRON_SMOKE_BLANK_USER_DATA',
    'CHATON_ELECTRON_SMOKE_CLOSE_TIMEOUT_MS',
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
    'CHATON_RELEASE_METADATA_SMOKE_SELF_TEST',
    'CHATON_RELEASE_DIR',
    'CHATON_RELEASE_METADATA_PATH',
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

function assertEnv(condition, message) {
  if (!condition) {
    throw new Error(`mac-release-smoke env isolation self-test failed: ${message}`);
  }
}

function assertNoInheritedElectronControls(env, label) {
  assertEnv(!env.CHATON_ELECTRON_SMOKE_APP_PATH, `${label} inherited app path`);
  assertEnv(env.CHATON_ELECTRON_SMOKE_CLOSE_TIMEOUT_MS === '3000', `${label} did not force close timeout`);
  assertEnv(!env.CHATON_ELECTRON_SMOKE_EXPECT_ONBOARDING, `${label} inherited onboarding expectation`);
  assertEnv(!env.CHATON_ELECTRON_SMOKE_ISOLATE_USER_DATA, `${label} inherited isolate userData flag`);
  assertEnv(!env.CHATON_ELECTRON_SMOKE_KEEP_USER_DATA, `${label} inherited keep userData flag`);
  assertEnv(!env.CHATON_ELECTRON_SMOKE_MODE, `${label} inherited electron mode`);
  assertEnv(!env.CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS, `${label} inherited prompt timeout`);
  assertEnv(!env.CHATON_ELECTRON_SMOKE_SELF_TEST, `${label} inherited electron self-test`);
  assertEnv(!env.CHATON_EXPECTED_APP_VERSION, `${label} inherited expected app version`);
  assertEnv(!env.CHATON_SMOKE_EXTENSION_PORT, `${label} inherited extension fixture port`);
  assertEnv(!env.CHATON_SMOKE_IGNORE_SIGTERM, `${label} inherited extension fixture signal override`);
  assertEnv(!env.CHATON_SOURCE_USER_DATA_DIR, `${label} inherited source userData override`);
  assertEnv(!env.CHATON_USER_DATA_DIR, `${label} inherited launch userData override`);
}

function runEnvIsolationSelfTest() {
  const planned = Object.fromEntries(steps.map((current) => [current.name, summarizeStepEnv(current)]));
  assertEnv(!planned['release metadata'].CHATON_EXPECTED_MODEL, 'metadata step inherited CHATON_EXPECTED_MODEL');
  assertEnv(!planned['release metadata'].CHATON_RELEASE_METADATA_SMOKE_SELF_TEST, 'metadata step inherited release metadata self-test');
  assertEnv(!planned['release metadata'].CHATON_RELEASE_DIR, 'metadata step inherited CHATON_RELEASE_DIR');
  assertEnv(!planned['release metadata'].CHATON_RELEASE_METADATA_PATH, 'metadata step inherited CHATON_RELEASE_METADATA_PATH');
  assertEnv(!planned['mounted DMG startup smoke'].CHATON_DMG_SMOKE_DRY_RUN, 'mounted startup inherited DMG dry-run flag');
  assertEnv(!planned['mounted DMG startup smoke'].CHATON_DMG_SMOKE_SELF_TEST, 'mounted startup inherited DMG self-test flag');
  assertEnv(!planned['mounted DMG startup smoke'].CHATON_DMG_SMOKE_DMG_PATH, 'mounted startup inherited DMG path override');
  assertEnv(!planned['mounted DMG startup smoke'].CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT, 'mounted startup inherited prompt allow flag');
  assertEnv(!planned['mounted DMG startup smoke'].CHATON_ELECTRON_SMOKE_PROMPT, 'mounted startup inherited prompt');
  assertEnv(!planned['mounted DMG startup smoke'].CHATON_ELECTRON_SMOKE_BLANK_USER_DATA, 'mounted startup inherited blank userData flag');
  assertEnv(!planned['mounted DMG startup smoke'].CHATON_ELECTRON_SMOKE_FLOW, 'mounted startup inherited flow');
  assertNoInheritedElectronControls(planned['mounted DMG startup smoke'], 'mounted startup');
  assertEnv(!planned['installed-copy DMG startup smoke'].CHATON_DMG_SMOKE_DRY_RUN, 'installed startup inherited DMG dry-run flag');
  assertEnv(!planned['installed-copy DMG startup smoke'].CHATON_DMG_SMOKE_SELF_TEST, 'installed startup inherited DMG self-test flag');
  assertEnv(!planned['installed-copy DMG startup smoke'].CHATON_DMG_SMOKE_DMG_PATH, 'installed startup inherited DMG path override');
  assertEnv(!planned['installed-copy DMG startup smoke'].CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT, 'installed startup inherited prompt allow flag');
  assertEnv(!planned['installed-copy DMG startup smoke'].CHATON_ELECTRON_SMOKE_PROMPT, 'installed startup inherited prompt');
  assertEnv(!planned['installed-copy DMG startup smoke'].CHATON_ELECTRON_SMOKE_FLOW, 'installed startup inherited flow');
  assertEnv(planned['installed-copy DMG startup smoke'].CHATON_DMG_SMOKE_INSTALL_COPY === '1', 'installed startup did not force install copy');
  assertNoInheritedElectronControls(planned['installed-copy DMG startup smoke'], 'installed startup');
  if (isFull) {
    assertEnv(planned['installed-copy DMG interactive smoke'].CHATON_ELECTRON_SMOKE_FLOW === 'interactive', 'interactive step did not force interactive flow');
    assertNoInheritedElectronControls(planned['installed-copy DMG interactive smoke'], 'installed interactive');
    assertEnv(!planned['installed-copy DMG blank-userData onboarding smoke'].CHATON_EXPECTED_MODEL, 'blank onboarding step inherited expected model');
    assertEnv(planned['installed-copy DMG blank-userData onboarding smoke'].CHATON_ELECTRON_SMOKE_BLANK_USER_DATA === '1', 'blank onboarding step did not force blank userData');
    assertNoInheritedElectronControls(planned['installed-copy DMG blank-userData onboarding smoke'], 'blank onboarding');
    assertEnv(planned['installed-copy DMG prompt smoke'].CHATON_ELECTRON_SMOKE_PROMPT === 'Reponds exactement: OK_CHATON_RELEASE_SMOKE', 'prompt step did not force release prompt');
    assertEnv(planned['installed-copy DMG prompt smoke'].CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT === '1', 'prompt step did not allow orchestrated electron prompt');
    assertEnv(planned['installed-copy DMG prompt smoke'].CHATON_ELECTRON_SMOKE_FRESH_USER_DATA === '1', 'prompt step did not force fresh userData');
    assertNoInheritedElectronControls(planned['installed-copy DMG prompt smoke'], 'prompt smoke');
  }
  console.log(JSON.stringify({ ok: true, selfTest, full: isFull, steps: Object.keys(planned) }, null, 2));
}

if (selfTest === 'env-isolation') {
  runEnvIsolationSelfTest();
  process.exit(0);
}

if (selfTest) {
  throw new Error(`Unknown mac release smoke self-test: ${selfTest}`);
}

if (isDryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    full: isFull,
    expectedModel,
    steps: steps.map((current) => ({
      name: current.name,
      args: current.args,
      env: summarizeStepEnv(current),
      unsetEnv: current.unsetEnv,
    })),
  }, null, 2));
  process.exit(0);
}

if (process.platform !== 'darwin') {
  throw new Error('macOS release smoke requires darwin because it mounts DMGs and verifies Gatekeeper signatures.');
}

for (const [index, current] of steps.entries()) {
  const label = `[mac-release-smoke ${index + 1}/${steps.length}] ${current.name}`;
  console.log(`\n${label}`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, current.args, {
      cwd: repoRoot,
      env: buildChildEnv(current),
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with code=${code ?? 'null'} signal=${signal ?? 'none'}`));
    });
  });
}

console.log(JSON.stringify({
  ok: true,
  full: isFull,
  expectedModel,
  steps: steps.map((item) => item.name),
}, null, 2));
