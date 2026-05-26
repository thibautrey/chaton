import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const includeReleaseMetadata = process.env.CHATON_RELIABILITY_SMOKE_INCLUDE_RELEASE === '1';
const selfTest = process.env.CHATON_RELIABILITY_SMOKE_SELF_TEST?.trim() || null;
const expectedModel = 'litellm/gpt-5.5';

function step(name, args, env = {}, unsetEnv = []) {
  return { name, args, env, unsetEnv };
}

const inheritedQaEnvToClear = [
  'CHATON_ALLOW_AUTOMATION_INSTANCE',
  'CHATON_BUG_LOG_PATH',
  'CHATON_BUG_LOG_SMOKE_SELF_TEST',
  'CHATON_BUILD_OUTPUT_SMOKE_FIXTURE_ROOT',
  'CHATON_BUILD_OUTPUT_SMOKE_SELF_TEST',
  'CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT',
  'CHATON_DMG_SMOKE_DMG_PATH',
  'CHATON_DMG_SMOKE_DRY_RUN',
  'CHATON_DMG_SMOKE_INSTALL_COPY',
  'CHATON_DMG_SMOKE_SELF_TEST',
  'CHATON_DISABLE_DEVTOOLS',
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
  'CHATON_MAC_RELEASE_SMOKE_DRY_RUN',
  'CHATON_MAC_RELEASE_SMOKE_FULL',
  'CHATON_MAC_RELEASE_SMOKE_SELF_TEST',
  'CHATON_QA_HYGIENE_ALLOW_SELF',
  'CHATON_QA_HYGIENE_SELF_TEST',
  'CHATON_QA_MANIFEST_SMOKE_FIXTURE_ROOT',
  'CHATON_QA_MANIFEST_SMOKE_SELF_TEST',
  'CHATON_QA_TEMP_ROOT',
  'CHATON_RELEASE_METADATA_SMOKE_SELF_TEST',
  'CHATON_RELEASE_DIR',
  'CHATON_RELEASE_METADATA_PATH',
  'CHATON_SMOKE_EXTENSION_PORT',
  'CHATON_SMOKE_IGNORE_SIGTERM',
  'CHATON_SOURCE_USER_DATA_DIR',
  'CHATON_USER_DATA_DIR',
];

const steps = [
  step('QA manifest fixture self-test', ['scripts/qa/qa-manifest-smoke.mjs'], {
    CHATON_QA_MANIFEST_SMOKE_SELF_TEST: 'fixtures',
  }),
  step('QA manifest contract', ['scripts/qa/qa-manifest-smoke.mjs']),
  step('bug log fixture self-test', ['scripts/qa/bug-log-smoke.mjs'], {
    CHATON_BUG_LOG_SMOKE_SELF_TEST: 'fixtures',
  }),
  step('bug log contract', ['scripts/qa/bug-log-smoke.mjs']),
  step('build output fixture self-test', ['scripts/qa/build-output-smoke.mjs'], {
    CHATON_BUILD_OUTPUT_SMOKE_SELF_TEST: 'fixtures',
  }),
  step('electron sqlite snapshot self-test', ['scripts/qa/electron-smoke.mjs'], {
    CHATON_ELECTRON_SMOKE_SELF_TEST: 'sqlite-snapshot',
  }),
  step('electron screenshot analysis self-test', ['scripts/qa/electron-smoke.mjs'], {
    CHATON_ELECTRON_SMOKE_SELF_TEST: 'screenshot-analysis',
  }),
  step('electron dev server preflight self-test', ['scripts/qa/electron-smoke.mjs'], {
    CHATON_ELECTRON_SMOKE_SELF_TEST: 'dev-server-preflight',
  }),
  step('electron signal cleanup self-test', ['scripts/qa/electron-smoke.mjs'], {
    CHATON_ELECTRON_SMOKE_SELF_TEST: 'signal-cleanup',
  }),
  step('DMG smoke env contract', ['scripts/qa/dmg-smoke.mjs'], {
    CHATON_DMG_SMOKE_SELF_TEST: 'env',
  }),
  step('DMG install-copy cleanup self-test', ['scripts/qa/dmg-smoke.mjs'], {
    CHATON_DMG_SMOKE_SELF_TEST: 'install-copy-cleanup',
  }),
  step('mac release smoke env contract', ['scripts/qa/mac-release-smoke.mjs'], {
    CHATON_MAC_RELEASE_SMOKE_FULL: '1',
    CHATON_MAC_RELEASE_SMOKE_SELF_TEST: 'env-isolation',
  }),
  step('DMG smoke dry-run', ['scripts/qa/dmg-smoke.mjs'], {
    CHATON_DMG_SMOKE_DRY_RUN: '1',
    CHATON_EXPECTED_MODEL: expectedModel,
  }),
  step('mac release smoke full dry-run', ['scripts/qa/mac-release-smoke.mjs'], {
    CHATON_MAC_RELEASE_SMOKE_DRY_RUN: '1',
    CHATON_MAC_RELEASE_SMOKE_FULL: '1',
    CHATON_EXPECTED_MODEL: expectedModel,
  }),
  step('QA hygiene fixture self-test', ['scripts/qa/hygiene-smoke.mjs'], {
    CHATON_QA_HYGIENE_SELF_TEST: 'fixtures',
  }),
  step('QA hygiene contract', ['scripts/qa/hygiene-smoke.mjs'], {
    CHATON_QA_HYGIENE_ALLOW_SELF: '1',
  }),
  step('release metadata fixture self-test', ['scripts/qa/release-metadata-smoke.mjs'], {
    CHATON_RELEASE_METADATA_SMOKE_SELF_TEST: 'fixtures',
  }),
];

if (includeReleaseMetadata) {
  steps.push(step('release metadata contract', ['scripts/qa/release-metadata-smoke.mjs']));
}

function buildChildEnv(current) {
  const childEnv = { ...process.env };
  for (const key of inheritedQaEnvToClear) {
    delete childEnv[key];
  }
  for (const key of current.unsetEnv) {
    delete childEnv[key];
  }
  Object.assign(childEnv, current.env);
  return childEnv;
}

function summarizeStepEnv(current) {
  const childEnv = buildChildEnv(current);
  const keys = [
    'CHATON_DMG_SMOKE_DRY_RUN',
    'CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT',
    'CHATON_DMG_SMOKE_SELF_TEST',
    'CHATON_ALLOW_AUTOMATION_INSTANCE',
    'CHATON_BUG_LOG_PATH',
    'CHATON_BUG_LOG_SMOKE_SELF_TEST',
    'CHATON_BUILD_OUTPUT_SMOKE_FIXTURE_ROOT',
    'CHATON_BUILD_OUTPUT_SMOKE_SELF_TEST',
    'CHATON_DISABLE_DEVTOOLS',
    'CHATON_ELECTRON_SMOKE_APP_PATH',
    'CHATON_ELECTRON_SMOKE_BLANK_USER_DATA',
    'CHATON_ELECTRON_SMOKE_CLOSE_TIMEOUT_MS',
    'CHATON_ELECTRON_SMOKE_EXPECT_ONBOARDING',
    'CHATON_ELECTRON_SMOKE_EXPECTED_REPLY',
    'CHATON_ELECTRON_SMOKE_EXPECTED_REPLY_MODE',
    'CHATON_ELECTRON_SMOKE_FLOW',
    'CHATON_ELECTRON_SMOKE_PROMPT',
    'CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS',
    'CHATON_ELECTRON_SMOKE_FRESH_USER_DATA',
    'CHATON_ELECTRON_SMOKE_ISOLATE_USER_DATA',
    'CHATON_ELECTRON_SMOKE_KEEP_USER_DATA',
    'CHATON_ELECTRON_SMOKE_MODE',
    'CHATON_ELECTRON_SMOKE_SELF_TEST',
    'CHATON_EXPECTED_APP_VERSION',
    'CHATON_EXPECTED_MODEL',
    'CHATON_MAC_RELEASE_SMOKE_DRY_RUN',
    'CHATON_MAC_RELEASE_SMOKE_FULL',
    'CHATON_MAC_RELEASE_SMOKE_SELF_TEST',
    'CHATON_QA_HYGIENE_ALLOW_SELF',
    'CHATON_QA_HYGIENE_SELF_TEST',
    'CHATON_QA_MANIFEST_SMOKE_FIXTURE_ROOT',
    'CHATON_QA_MANIFEST_SMOKE_SELF_TEST',
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
    throw new Error(`reliability-smoke env isolation self-test failed: ${message}`);
  }
}

function assertNoInheritedElectronControls(env, label) {
  assertEnv(env.CHATON_ELECTRON_SMOKE_APP_PATH === undefined, `${label} inherited app path`);
  assertEnv(env.CHATON_ELECTRON_SMOKE_CLOSE_TIMEOUT_MS === undefined, `${label} inherited close timeout`);
  assertEnv(env.CHATON_ELECTRON_SMOKE_EXPECT_ONBOARDING === undefined, `${label} inherited onboarding expectation`);
  assertEnv(env.CHATON_ELECTRON_SMOKE_EXPECTED_REPLY === undefined, `${label} inherited expected reply`);
  assertEnv(env.CHATON_ELECTRON_SMOKE_EXPECTED_REPLY_MODE === undefined, `${label} inherited expected reply mode`);
  assertEnv(env.CHATON_ELECTRON_SMOKE_FRESH_USER_DATA === undefined, `${label} inherited fresh userData flag`);
  assertEnv(env.CHATON_ELECTRON_SMOKE_ISOLATE_USER_DATA === undefined, `${label} inherited isolate userData flag`);
  assertEnv(env.CHATON_ELECTRON_SMOKE_KEEP_USER_DATA === undefined, `${label} inherited keep userData flag`);
  assertEnv(env.CHATON_ELECTRON_SMOKE_MODE === undefined, `${label} inherited electron mode`);
  assertEnv(env.CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS === undefined, `${label} inherited prompt timeout`);
  assertEnv(env.CHATON_EXPECTED_APP_VERSION === undefined, `${label} inherited expected app version`);
  assertEnv(env.CHATON_ALLOW_AUTOMATION_INSTANCE === undefined, `${label} inherited automation instance flag`);
  assertEnv(env.CHATON_DISABLE_DEVTOOLS === undefined, `${label} inherited devtools flag`);
  assertEnv(env.CHATON_SMOKE_EXTENSION_PORT === undefined, `${label} inherited extension fixture port`);
  assertEnv(env.CHATON_SMOKE_IGNORE_SIGTERM === undefined, `${label} inherited extension fixture signal override`);
  assertEnv(env.CHATON_SOURCE_USER_DATA_DIR === undefined, `${label} inherited source userData override`);
  assertEnv(env.CHATON_USER_DATA_DIR === undefined, `${label} inherited launch userData override`);
}

function runEnvIsolationSelfTest() {
  const planned = Object.fromEntries(steps.map((current) => [current.name, summarizeStepEnv(current)]));
  assertEnv(planned['QA manifest fixture self-test'].CHATON_QA_MANIFEST_SMOKE_SELF_TEST === 'fixtures', 'QA manifest fixture self-test not forced');
  assertEnv(planned['QA manifest fixture self-test'].CHATON_QA_MANIFEST_SMOKE_FIXTURE_ROOT === undefined, 'QA manifest fixture inherited fixture root');
  assertEnv(planned['QA manifest contract'].CHATON_QA_MANIFEST_SMOKE_SELF_TEST === undefined, 'QA manifest inherited self-test flag');
  assertEnv(planned['QA manifest contract'].CHATON_QA_MANIFEST_SMOKE_FIXTURE_ROOT === undefined, 'QA manifest inherited fixture root');
  assertEnv(planned['QA manifest contract'].CHATON_ELECTRON_SMOKE_PROMPT === undefined, 'QA manifest inherited electron prompt');
  assertEnv(planned['bug log fixture self-test'].CHATON_BUG_LOG_SMOKE_SELF_TEST === 'fixtures', 'bug log fixture self-test not forced');
  assertEnv(planned['bug log fixture self-test'].CHATON_BUG_LOG_PATH === undefined, 'bug log fixture inherited bug log path');
  assertEnv(planned['bug log contract'].CHATON_ELECTRON_SMOKE_PROMPT === undefined, 'bug log inherited electron prompt');
  assertEnv(planned['bug log contract'].CHATON_BUG_LOG_SMOKE_SELF_TEST === undefined, 'bug log contract inherited self-test flag');
  assertEnv(planned['bug log contract'].CHATON_BUG_LOG_PATH === undefined, 'bug log contract inherited bug log path');
  assertEnv(planned['build output fixture self-test'].CHATON_BUILD_OUTPUT_SMOKE_SELF_TEST === 'fixtures', 'build output fixture self-test not forced');
  assertEnv(planned['build output fixture self-test'].CHATON_BUILD_OUTPUT_SMOKE_FIXTURE_ROOT === undefined, 'build output fixture inherited fixture root');
  assertNoInheritedElectronControls(planned['QA manifest contract'], 'QA manifest');
  assertNoInheritedElectronControls(planned['bug log contract'], 'bug log');
  if (includeReleaseMetadata) {
    assertEnv(planned['release metadata contract'].CHATON_RELEASE_METADATA_SMOKE_SELF_TEST === undefined, 'release metadata inherited self-test flag');
    assertEnv(planned['release metadata contract'].CHATON_RELEASE_DIR === undefined, 'release metadata inherited release dir override');
    assertEnv(planned['release metadata contract'].CHATON_RELEASE_METADATA_PATH === undefined, 'release metadata inherited metadata path override');
  }
  assertEnv(planned['electron sqlite snapshot self-test'].CHATON_ELECTRON_SMOKE_SELF_TEST === 'sqlite-snapshot', 'sqlite self-test not forced');
  assertEnv(planned['electron sqlite snapshot self-test'].CHATON_ELECTRON_SMOKE_PROMPT === undefined, 'sqlite self-test inherited prompt');
  assertNoInheritedElectronControls(planned['electron sqlite snapshot self-test'], 'sqlite self-test');
  assertEnv(planned['electron dev server preflight self-test'].CHATON_ELECTRON_SMOKE_SELF_TEST === 'dev-server-preflight', 'dev server preflight self-test not forced');
  assertEnv(planned['electron dev server preflight self-test'].CHATON_ELECTRON_SMOKE_PROMPT === undefined, 'dev server preflight self-test inherited prompt');
  assertNoInheritedElectronControls(planned['electron dev server preflight self-test'], 'dev server preflight self-test');
  assertEnv(planned['DMG smoke env contract'].CHATON_DMG_SMOKE_SELF_TEST === 'env', 'DMG env self-test not forced');
  assertEnv(planned['DMG install-copy cleanup self-test'].CHATON_DMG_SMOKE_SELF_TEST === 'install-copy-cleanup', 'DMG install-copy cleanup self-test not forced');
  assertEnv(planned['DMG install-copy cleanup self-test'].CHATON_DMG_SMOKE_DRY_RUN === undefined, 'DMG install-copy cleanup self-test inherited dry-run flag');
  assertEnv(planned['DMG install-copy cleanup self-test'].CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT === undefined, 'DMG install-copy cleanup self-test inherited prompt allow flag');
  assertNoInheritedElectronControls(planned['DMG install-copy cleanup self-test'], 'DMG install-copy cleanup self-test');
  assertEnv(planned['DMG smoke dry-run'].CHATON_DMG_SMOKE_DRY_RUN === '1', 'DMG dry-run not forced');
  assertEnv(planned['DMG smoke dry-run'].CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT === undefined, 'DMG dry-run inherited prompt allow flag');
  assertEnv(planned['DMG smoke dry-run'].CHATON_EXPECTED_MODEL === expectedModel, 'DMG dry-run expected model not forced');
  assertNoInheritedElectronControls(planned['DMG smoke dry-run'], 'DMG dry-run');
  assertEnv(planned['mac release smoke full dry-run'].CHATON_MAC_RELEASE_SMOKE_DRY_RUN === '1', 'mac release dry-run not forced');
  assertEnv(planned['mac release smoke full dry-run'].CHATON_MAC_RELEASE_SMOKE_FULL === '1', 'mac release full not forced');
  assertEnv(planned['mac release smoke full dry-run'].CHATON_EXPECTED_MODEL === expectedModel, 'mac release dry-run expected model not forced');
  assertNoInheritedElectronControls(planned['mac release smoke full dry-run'], 'mac release dry-run');
  assertEnv(planned['QA hygiene fixture self-test'].CHATON_QA_HYGIENE_SELF_TEST === 'fixtures', 'hygiene fixture self-test not forced');
  assertEnv(planned['QA hygiene fixture self-test'].CHATON_QA_HYGIENE_ALLOW_SELF === undefined, 'hygiene fixture self-test inherited self allowance');
  assertEnv(planned['QA hygiene contract'].CHATON_QA_HYGIENE_ALLOW_SELF === '1', 'hygiene self allowance not forced');
  assertEnv(planned['QA hygiene contract'].CHATON_QA_HYGIENE_SELF_TEST === undefined, 'hygiene contract inherited fixture self-test');
  assertEnv(planned['release metadata fixture self-test'].CHATON_RELEASE_METADATA_SMOKE_SELF_TEST === 'fixtures', 'release metadata fixture self-test not forced');
  assertEnv(planned['release metadata fixture self-test'].CHATON_RELEASE_DIR === undefined, 'release metadata fixture inherited release dir override');
  assertEnv(planned['release metadata fixture self-test'].CHATON_RELEASE_METADATA_PATH === undefined, 'release metadata fixture inherited metadata path override');
  console.log(JSON.stringify({ ok: true, selfTest, includeReleaseMetadata, expectedModel, steps: Object.keys(planned) }, null, 2));
}

if (selfTest === 'env-isolation') {
  runEnvIsolationSelfTest();
  process.exit(0);
}

if (selfTest) {
  throw new Error(`Unknown reliability smoke self-test: ${selfTest}`);
}

for (const [index, current] of steps.entries()) {
  const label = `[reliability-smoke ${index + 1}/${steps.length}] ${current.name}`;
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
  includeReleaseMetadata,
  expectedModel,
  steps: steps.map((item) => item.name),
}, null, 2));
