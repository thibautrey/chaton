import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRepoRoot = path.resolve(__dirname, '..', '..');
const selfTest = process.env.CHATON_QA_MANIFEST_SMOKE_SELF_TEST?.trim() || null;
const generatedFixtureRoot = selfTest === 'fixtures' && !process.env.CHATON_QA_MANIFEST_SMOKE_FIXTURE_ROOT
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'chaton-qa-manifest-self-test-'))
  : null;
const repoRoot = selfTest === 'fixtures'
  ? path.resolve(process.env.CHATON_QA_MANIFEST_SMOKE_FIXTURE_ROOT ?? generatedFixtureRoot ?? defaultRepoRoot)
  : defaultRepoRoot;
const packageJsonPath = path.join(repoRoot, 'package.json');
const qaScriptsDir = path.join(repoRoot, 'scripts', 'qa');

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractQaScriptTargets(command) {
  return [...command.matchAll(/\bscripts\/qa\/[A-Za-z0-9._-]+\.mjs\b/g)].map((match) => match[0]);
}

function validateManifest(root) {
  const manifestPackageJsonPath = path.join(root, 'package.json');
  const manifestQaScriptsDir = path.join(root, 'scripts', 'qa');
  const packageJson = JSON.parse(fs.readFileSync(manifestPackageJsonPath, 'utf8'));
  const scripts = packageJson.scripts ?? {};
  const qaScripts = Object.entries(scripts)
    .filter(([name]) => name.startsWith('qa:'))
    .sort(([left], [right]) => left.localeCompare(right));

  assertCondition(qaScripts.length > 0, 'package.json does not define any qa:* scripts');
  assertCondition(fs.existsSync(manifestQaScriptsDir), `QA scripts directory is missing: ${manifestQaScriptsDir}`);

  const qaFiles = fs.readdirSync(manifestQaScriptsDir)
    .filter((fileName) => fileName.endsWith('.mjs'))
    .map((fileName) => `scripts/qa/${fileName}`)
    .sort();

  const targetToScriptNames = new Map(qaFiles.map((filePath) => [filePath, []]));
  const scriptSummaries = [];

  for (const [scriptName, command] of qaScripts) {
    assertCondition(typeof command === 'string' && command.trim().length > 0, `${scriptName} has an empty command`);
    assertCondition(!command.includes('&&') && !command.includes(';'), `${scriptName} chains commands; qa aliases should wrap one smoke entrypoint`);

    const targets = extractQaScriptTargets(command);
    assertCondition(targets.length === 1, `${scriptName} must reference exactly one scripts/qa/*.mjs target, saw ${targets.length}`);

    const [target] = targets;
    const targetPath = path.join(root, target);
    assertCondition(fs.existsSync(targetPath), `${scriptName} references missing QA script: ${target}`);
    assertCondition(fs.statSync(targetPath).isFile(), `${scriptName} target is not a file: ${target}`);

    if (!targetToScriptNames.has(target)) {
      targetToScriptNames.set(target, []);
    }
    targetToScriptNames.get(target).push(scriptName);
    scriptSummaries.push({ name: scriptName, target });
  }

  const unexposedQaFiles = qaFiles.filter((filePath) => (targetToScriptNames.get(filePath) ?? []).length === 0);
  assertCondition(unexposedQaFiles.length === 0, `QA files without package.json qa:* alias: ${unexposedQaFiles.join(', ')}`);

  return {
    packageJsonPath: manifestPackageJsonPath,
    qaScriptCount: qaScripts.length,
    qaFileCount: qaFiles.length,
    qaFiles,
    scripts: scriptSummaries,
  };
}

function writeFixture(root, scripts, qaFiles = ['one-smoke.mjs']) {
  fs.mkdirSync(path.join(root, 'scripts', 'qa'), { recursive: true });
  for (const fileName of qaFiles) {
    fs.writeFileSync(path.join(root, 'scripts', 'qa', fileName), 'console.log("ok");\n');
  }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }, null, 2));
}

function assertSelfTest(condition, message) {
  if (!condition) {
    throw new Error(`qa-manifest-smoke self-test failed: ${message}`);
  }
}

function expectFixtureFailure(name, setup) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `chaton-qa-manifest-${name}-`));
  try {
    setup(fixtureRoot);
    let failed = false;
    try {
      validateManifest(fixtureRoot);
    } catch {
      failed = true;
    }
    assertSelfTest(failed, `${name} fixture should fail`);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function runFixtureSelfTest() {
  assertSelfTest(repoRoot !== defaultRepoRoot, 'fixture self-test must not run against the repository root');
  writeFixture(repoRoot, { 'qa:one': 'node scripts/qa/one-smoke.mjs' });
  const valid = validateManifest(repoRoot);
  assertSelfTest(valid.qaScriptCount === 1, `expected one fixture qa script, got ${valid.qaScriptCount}`);
  assertSelfTest(valid.qaFileCount === 1, `expected one fixture qa file, got ${valid.qaFileCount}`);

  expectFixtureFailure('unexposed', (root) => {
    writeFixture(root, { 'qa:one': 'node scripts/qa/one-smoke.mjs' }, ['one-smoke.mjs', 'two-smoke.mjs']);
  });
  expectFixtureFailure('missing-target', (root) => {
    writeFixture(root, { 'qa:missing': 'node scripts/qa/missing-smoke.mjs' });
  });
  expectFixtureFailure('chained-command', (root) => {
    writeFixture(root, { 'qa:chain': 'node scripts/qa/one-smoke.mjs && node scripts/qa/one-smoke.mjs' });
  });
  expectFixtureFailure('two-targets', (root) => {
    writeFixture(root, { 'qa:two': 'node scripts/qa/one-smoke.mjs node scripts/qa/two-smoke.mjs' }, ['one-smoke.mjs', 'two-smoke.mjs']);
  });

  console.log(JSON.stringify({ ok: true, selfTest: 'fixtures', repoRoot, qaScriptCount: valid.qaScriptCount }, null, 2));
}

if (selfTest === 'fixtures') {
  try {
    runFixtureSelfTest();
  } finally {
    if (generatedFixtureRoot) {
      fs.rmSync(generatedFixtureRoot, { recursive: true, force: true });
    }
  }
  process.exit(0);
}

if (selfTest) {
  throw new Error(`Unknown QA manifest smoke self-test: ${selfTest}`);
}

const result = validateManifest(repoRoot);
console.log(JSON.stringify({
  ok: true,
  ...result,
}, null, 2));
