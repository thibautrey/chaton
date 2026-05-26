import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const includeReleaseMetadata = process.env.CHATON_PROD_READY_INCLUDE_RELEASE === '1';
const includeBuild = process.env.CHATON_PROD_READY_INCLUDE_BUILD === '1';
const allowReducedGate = process.env.CHATON_PROD_READY_ALLOW_REDUCED === '1';
const includeUnitTests = !allowReducedGate || process.env.CHATON_PROD_READY_SKIP_TESTS !== '1';
const includeAudit = !allowReducedGate || process.env.CHATON_PROD_READY_SKIP_AUDIT !== '1';
const isDryRun = process.env.CHATON_PROD_READY_DRY_RUN === '1';
const selfTest = process.env.CHATON_PROD_READY_SELF_TEST?.trim() || null;
const nodeCommand = process.execPath;
const localTscPath = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

function step(name, command, args, env = {}, unsetEnv = []) {
  return { name, command, args, env, unsetEnv };
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
  'CHATON_PROD_READY_ALLOW_REDUCED',
  'CHATON_PROD_READY_DRY_RUN',
  'CHATON_PROD_READY_INCLUDE_BUILD',
  'CHATON_PROD_READY_INCLUDE_RELEASE',
  'CHATON_PROD_READY_SELF_TEST',
  'CHATON_PROD_READY_SKIP_AUDIT',
  'CHATON_PROD_READY_SKIP_TESTS',
  'CHATON_QA_HYGIENE_ALLOW_SELF',
  'CHATON_QA_HYGIENE_SELF_TEST',
  'CHATON_QA_MANIFEST_SMOKE_FIXTURE_ROOT',
  'CHATON_QA_MANIFEST_SMOKE_SELF_TEST',
  'CHATON_QA_TEMP_ROOT',
  'CHATON_RELEASE_METADATA_SMOKE_SELF_TEST',
  'CHATON_RELEASE_DIR',
  'CHATON_RELEASE_METADATA_PATH',
  'CHATON_RELIABILITY_SMOKE_INCLUDE_RELEASE',
  'CHATON_RELIABILITY_SMOKE_SELF_TEST',
  'CHATON_SMOKE_EXTENSION_PORT',
  'CHATON_SMOKE_IGNORE_SIGTERM',
  'CHATON_SOURCE_USER_DATA_DIR',
  'CHATON_USER_DATA_DIR',
];

const steps = [
  step('reliability smoke', nodeCommand, ['scripts/qa/reliability-smoke.mjs'], {
    ...(includeReleaseMetadata ? { CHATON_RELIABILITY_SMOKE_INCLUDE_RELEASE: '1' } : {}),
  }),
  step('lint', 'npm', ['run', 'lint', '--', '--max-warnings=0']),
  step('typecheck', nodeCommand, [localTscPath, '-b', '--pretty', 'false']),
];

if (includeUnitTests) {
  steps.push(step('unit tests', 'npm', ['test']));
}

if (includeAudit) {
  steps.push(step('npm audit', 'npm', ['audit', '--json']));
}

if (includeBuild) {
  steps.push(step('production build', 'npm', ['run', 'build']));
  steps.push(step('build output smoke', nodeCommand, ['scripts/qa/build-output-smoke.mjs']));
}

steps.push(step('QA hygiene', nodeCommand, ['scripts/qa/hygiene-smoke.mjs']));

function summarizeSteps() {
  return steps.map((item) => ({
    name: item.name,
    command: item.command,
    args: item.args,
    env: item.env,
    effectiveEnv: summarizeStepEnv(item),
  }));
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
    'CHATON_ELECTRON_SMOKE_FRESH_USER_DATA',
    'CHATON_ELECTRON_SMOKE_ISOLATE_USER_DATA',
    'CHATON_ELECTRON_SMOKE_KEEP_USER_DATA',
    'CHATON_ELECTRON_SMOKE_MODE',
    'CHATON_ELECTRON_SMOKE_PROMPT',
    'CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS',
    'CHATON_ELECTRON_SMOKE_SELF_TEST',
    'CHATON_EXPECTED_APP_VERSION',
    'CHATON_EXPECTED_MODEL',
    'CHATON_PROD_READY_SKIP_AUDIT',
    'CHATON_PROD_READY_SKIP_TESTS',
    'CHATON_QA_TEMP_ROOT',
    'CHATON_QA_HYGIENE_SELF_TEST',
    'CHATON_QA_MANIFEST_SMOKE_FIXTURE_ROOT',
    'CHATON_QA_MANIFEST_SMOKE_SELF_TEST',
    'CHATON_RELEASE_METADATA_SMOKE_SELF_TEST',
    'CHATON_RELEASE_DIR',
    'CHATON_RELEASE_METADATA_PATH',
    'CHATON_RELIABILITY_SMOKE_INCLUDE_RELEASE',
    'CHATON_RELIABILITY_SMOKE_SELF_TEST',
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
    throw new Error(`prod-ready-smoke self-test failed: ${message}`);
  }
}

function assertNoInheritedElectronControls(env, label) {
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_APP_PATH === undefined, `${label} inherited app path`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_BLANK_USER_DATA === undefined, `${label} inherited blank userData flag`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_CLOSE_TIMEOUT_MS === undefined, `${label} inherited close timeout`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_EXPECT_ONBOARDING === undefined, `${label} inherited onboarding expectation`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_EXPECTED_REPLY === undefined, `${label} inherited expected reply`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_EXPECTED_REPLY_MODE === undefined, `${label} inherited expected reply mode`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_FLOW === undefined, `${label} inherited electron flow`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_FRESH_USER_DATA === undefined, `${label} inherited fresh userData flag`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_ISOLATE_USER_DATA === undefined, `${label} inherited isolate userData flag`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_KEEP_USER_DATA === undefined, `${label} inherited keep userData flag`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_MODE === undefined, `${label} inherited electron mode`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_PROMPT_TIMEOUT_MS === undefined, `${label} inherited prompt timeout`);
  assertSelfTest(env.CHATON_ELECTRON_SMOKE_SELF_TEST === undefined, `${label} inherited electron self-test`);
  assertSelfTest(env.CHATON_EXPECTED_APP_VERSION === undefined, `${label} inherited expected app version`);
  assertSelfTest(env.CHATON_ALLOW_AUTOMATION_INSTANCE === undefined, `${label} inherited automation instance flag`);
  assertSelfTest(env.CHATON_DISABLE_DEVTOOLS === undefined, `${label} inherited devtools flag`);
  assertSelfTest(env.CHATON_SMOKE_EXTENSION_PORT === undefined, `${label} inherited extension fixture port`);
  assertSelfTest(env.CHATON_SMOKE_IGNORE_SIGTERM === undefined, `${label} inherited extension fixture signal override`);
  assertSelfTest(env.CHATON_SOURCE_USER_DATA_DIR === undefined, `${label} inherited source userData override`);
  assertSelfTest(env.CHATON_USER_DATA_DIR === undefined, `${label} inherited launch userData override`);
}

if (selfTest === 'required-steps') {
  const stepNames = steps.map((item) => item.name);
  assertSelfTest(stepNames.includes('reliability smoke'), 'missing reliability smoke');
  assertSelfTest(stepNames.includes('lint'), 'missing lint');
  assertSelfTest(stepNames.includes('typecheck'), 'missing typecheck');
  assertSelfTest(stepNames.includes('unit tests'), 'missing unit tests');
  assertSelfTest(stepNames.includes('npm audit'), 'missing npm audit');
  assertSelfTest(stepNames.at(-1) === 'QA hygiene', 'QA hygiene must run last');
  console.log(JSON.stringify({ ok: true, selfTest, allowReducedGate, includeUnitTests, includeAudit, steps: stepNames }, null, 2));
  process.exit(0);
}

if (selfTest === 'env-isolation') {
  const planned = Object.fromEntries(steps.map((current) => [current.name, summarizeStepEnv(current)]));
  assertSelfTest(planned.lint.CHATON_ELECTRON_SMOKE_PROMPT === undefined, 'lint inherited electron prompt');
  assertNoInheritedElectronControls(planned.lint, 'lint');
  assertSelfTest(planned['reliability smoke'].CHATON_RELIABILITY_SMOKE_SELF_TEST === undefined, 'reliability smoke inherited reliability self-test flag');
  assertSelfTest(planned['reliability smoke'].CHATON_BUG_LOG_SMOKE_SELF_TEST === undefined, 'reliability smoke inherited bug log self-test flag');
  assertSelfTest(planned['reliability smoke'].CHATON_BUG_LOG_PATH === undefined, 'reliability smoke inherited bug log path');
  assertSelfTest(planned['reliability smoke'].CHATON_QA_MANIFEST_SMOKE_SELF_TEST === undefined, 'reliability smoke inherited QA manifest self-test flag');
  assertSelfTest(planned['reliability smoke'].CHATON_QA_MANIFEST_SMOKE_FIXTURE_ROOT === undefined, 'reliability smoke inherited QA manifest fixture root');
  assertSelfTest(planned['reliability smoke'].CHATON_RELEASE_METADATA_SMOKE_SELF_TEST === undefined, 'reliability smoke inherited release metadata self-test flag');
  assertSelfTest(planned['reliability smoke'].CHATON_RELEASE_DIR === undefined, 'reliability smoke inherited release dir override');
  assertSelfTest(planned['reliability smoke'].CHATON_RELEASE_METADATA_PATH === undefined, 'reliability smoke inherited release metadata override');
  assertNoInheritedElectronControls(planned['reliability smoke'], 'reliability smoke');
  assertSelfTest(planned.typecheck.CHATON_DMG_SMOKE_DRY_RUN === undefined, 'typecheck inherited DMG dry-run flag');
  assertSelfTest(planned.typecheck.CHATON_DMG_SMOKE_ALLOW_ELECTRON_PROMPT === undefined, 'typecheck inherited DMG prompt allow flag');
  assertSelfTest(planned.typecheck.CHATON_DMG_SMOKE_SELF_TEST === undefined, 'typecheck inherited DMG self-test flag');
  assertNoInheritedElectronControls(planned.typecheck, 'typecheck');
  assertSelfTest(planned['unit tests'].CHATON_EXPECTED_MODEL === undefined, 'unit tests inherited expected model');
  assertNoInheritedElectronControls(planned['unit tests'], 'unit tests');
  assertSelfTest(planned['npm audit'].CHATON_PROD_READY_SKIP_AUDIT === undefined, 'npm audit inherited prod-ready skip audit flag');
  assertNoInheritedElectronControls(planned['npm audit'], 'npm audit');
  if (includeBuild) {
    assertSelfTest(planned['production build'].CHATON_ELECTRON_SMOKE_PROMPT === undefined, 'production build inherited electron prompt');
    assertSelfTest(planned['production build'].CHATON_DMG_SMOKE_DRY_RUN === undefined, 'production build inherited DMG dry-run flag');
    assertSelfTest(planned['production build'].CHATON_DMG_SMOKE_SELF_TEST === undefined, 'production build inherited DMG self-test flag');
    assertNoInheritedElectronControls(planned['production build'], 'production build');
    assertSelfTest(planned['build output smoke'].CHATON_EXPECTED_MODEL === undefined, 'build output smoke inherited expected model');
    assertSelfTest(planned['build output smoke'].CHATON_BUILD_OUTPUT_SMOKE_FIXTURE_ROOT === undefined, 'build output smoke inherited fixture root');
    assertSelfTest(planned['build output smoke'].CHATON_BUILD_OUTPUT_SMOKE_SELF_TEST === undefined, 'build output smoke inherited self-test flag');
    assertSelfTest(planned['build output smoke'].CHATON_QA_TEMP_ROOT === undefined, 'build output smoke inherited temp root override');
    assertNoInheritedElectronControls(planned['build output smoke'], 'build output smoke');
  }
  assertSelfTest(planned['QA hygiene'].CHATON_QA_TEMP_ROOT === undefined, 'QA hygiene inherited temp root override');
  assertSelfTest(planned['QA hygiene'].CHATON_QA_HYGIENE_SELF_TEST === undefined, 'QA hygiene inherited fixture self-test flag');
  assertNoInheritedElectronControls(planned['QA hygiene'], 'QA hygiene');
  if (includeReleaseMetadata) {
    assertSelfTest(planned['reliability smoke'].CHATON_RELIABILITY_SMOKE_INCLUDE_RELEASE === '1', 'release metadata flag not forwarded to reliability smoke');
  }
  console.log(JSON.stringify({ ok: true, selfTest, includeReleaseMetadata, includeBuild, steps: Object.keys(planned) }, null, 2));
  process.exit(0);
}

if (selfTest === 'build-steps') {
  const stepNames = steps.map((item) => item.name);
  assertSelfTest(includeBuild, 'build self-test must run with CHATON_PROD_READY_INCLUDE_BUILD=1');
  assertSelfTest(localTscPath.startsWith(repoRoot), 'local TypeScript path must stay inside the repository');
  assertSelfTest(steps.find((item) => item.name === 'typecheck')?.command === nodeCommand, 'typecheck should use the current Node executable');
  assertSelfTest(steps.find((item) => item.name === 'typecheck')?.args[0] === localTscPath, 'typecheck should use the local TypeScript compiler');
  assertSelfTest(stepNames.includes('production build'), 'missing production build');
  assertSelfTest(stepNames.includes('build output smoke'), 'missing build output smoke');
  assertSelfTest(steps.find((item) => item.name === 'reliability smoke')?.command === nodeCommand, 'reliability smoke should use the current Node executable');
  assertSelfTest(steps.find((item) => item.name === 'build output smoke')?.command === nodeCommand, 'build output smoke should use the current Node executable');
  assertSelfTest(steps.find((item) => item.name === 'QA hygiene')?.command === nodeCommand, 'QA hygiene should use the current Node executable');
  assertSelfTest(stepNames.indexOf('production build') > stepNames.indexOf('npm audit'), 'production build should run after audit');
  assertSelfTest(stepNames.indexOf('build output smoke') > stepNames.indexOf('production build'), 'build output smoke should run after production build');
  assertSelfTest(stepNames.at(-1) === 'QA hygiene', 'QA hygiene must run last after build');
  console.log(JSON.stringify({ ok: true, selfTest, includeBuild, steps: stepNames }, null, 2));
  process.exit(0);
}

if (selfTest) {
  throw new Error(`Unknown prod-ready smoke self-test: ${selfTest}`);
}

if (isDryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    includeReleaseMetadata,
    includeBuild,
    allowReducedGate,
    includeUnitTests,
    includeAudit,
    steps: summarizeSteps(),
  }, null, 2));
  process.exit(0);
}

const startedAt = Date.now();
for (const [index, current] of steps.entries()) {
  const label = `[prod-ready-smoke ${index + 1}/${steps.length}] ${current.name}`;
  console.log(`\n${label}`);
  await new Promise((resolve, reject) => {
    const child = spawn(current.command, current.args, {
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
  includeBuild,
  includeUnitTests,
  includeAudit,
  elapsedMs: Date.now() - startedAt,
  steps: steps.map((item) => item.name),
}, null, 2));
