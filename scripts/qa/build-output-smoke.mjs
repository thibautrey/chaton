import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRepoRoot = path.resolve(__dirname, '..', '..');
const selfTest = process.env.CHATON_BUILD_OUTPUT_SMOKE_SELF_TEST?.trim() || null;
const generatedFixtureRoot = selfTest === 'fixtures' && !process.env.CHATON_BUILD_OUTPUT_SMOKE_FIXTURE_ROOT
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'chaton-build-output-self-test-'))
  : null;
const repoRoot = selfTest === 'fixtures'
  ? path.resolve(process.env.CHATON_BUILD_OUTPUT_SMOKE_FIXTURE_ROOT ?? generatedFixtureRoot ?? defaultRepoRoot)
  : defaultRepoRoot;

const requiredFiles = [
  'dist/index.html',
  'dist-electron/electron/main.js',
  'dist-electron/electron/preload.js',
  'dist-electron/build/icons/icon.png',
  'dist-electron/resources/npm/package.json',
  'dist-electron/resources/npm/bin/npm-cli.js',
  'dist-electron/lib/pi/pi-wrapper.sh',
];

const builtinExtensionsDir = 'dist-electron/extensions/builtin';

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assertCondition(fs.existsSync(absolutePath), `Missing build output: ${relativePath}`);
  const stat = fs.statSync(absolutePath);
  assertCondition(stat.isFile(), `Build output is not a file: ${relativePath}`);
  assertCondition(stat.size > 0, `Build output is empty: ${relativePath}`);
  return { path: relativePath, size: stat.size };
}

function listFiles(relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }
  return fs.readdirSync(absoluteDir).map((fileName) => path.join(relativeDir, fileName));
}

function getLocalAssetReferences(html) {
  return [...html.matchAll(/\b(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((match) => match[1]);
}

function assertReferencedAssetsExist(htmlRelativePath) {
  const htmlPath = path.join(repoRoot, htmlRelativePath);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const references = getLocalAssetReferences(html);
  assertCondition(references.length > 0, `${htmlRelativePath} does not reference any local assets`);
  const htmlDir = path.dirname(htmlRelativePath);
  const assets = references.map((reference) => {
    const relativePath = path.normalize(path.join(htmlDir, reference));
    return assertFile(relativePath);
  });
  return { html: htmlRelativePath, references, assets };
}

function extensionPathFromWebviewUrl(extensionId, webviewUrl) {
  const prefix = 'chaton-extension://';
  if (!webviewUrl.startsWith(prefix)) {
    throw new Error(`unsupported built-in extension webviewUrl for ${extensionId}: ${webviewUrl}`);
  }
  const withoutScheme = webviewUrl.slice(prefix.length);
  const expectedPrefix = `${extensionId}/`;
  if (!withoutScheme.startsWith(expectedPrefix)) {
    throw new Error(`built-in extension webviewUrl for ${extensionId} must start with ${prefix}${expectedPrefix}`);
  }
  const relativePath = withoutScheme.slice(expectedPrefix.length);
  if (!relativePath) {
    throw new Error(`built-in extension webviewUrl for ${extensionId} is missing an HTML path`);
  }
  return relativePath.split(/[?#]/)[0];
}

function getBuiltinMainViewHtmlFiles() {
  const absoluteBuiltinDir = path.join(repoRoot, builtinExtensionsDir);
  if (!fs.existsSync(absoluteBuiltinDir)) {
    return [];
  }
  const htmlFiles = [];
  for (const extensionDirName of fs.readdirSync(absoluteBuiltinDir).sort()) {
    const manifestPath = path.join(absoluteBuiltinDir, extensionDirName, 'chaton.extension.json');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const mainView of manifest.ui?.mainViews ?? []) {
      const extensionId = manifest.id ?? extensionDirName;
      const extensionRelativePath = extensionPathFromWebviewUrl(extensionId, mainView.webviewUrl ?? '');
      htmlFiles.push({
        extensionId,
        viewId: mainView.viewId ?? null,
        htmlPath: path.join(builtinExtensionsDir, extensionDirName, extensionRelativePath),
      });
    }
  }
  return htmlFiles;
}

function assertSelfTest(condition, message) {
  if (!condition) {
    throw new Error(`build-output-smoke self-test failed: ${message}`);
  }
}

function writeFile(relativePath, contents = 'x') {
  const absolutePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

function runFixtureSelfTest() {
  assertSelfTest(repoRoot !== defaultRepoRoot, 'fixture self-test must not run against the repository root');
  writeFile('dist/index.html', '<!doctype html><script type="module" src="./assets/index-fixture.js"></script><link rel="stylesheet" href="./assets/index-fixture.css">');
  writeFile('dist/assets/index-fixture.js');
  writeFile('dist/assets/index-fixture.css');
  writeFile('dist-electron/electron/main.js');
  writeFile('dist-electron/electron/preload.js');
  writeFile('dist-electron/build/icons/icon.png');
  writeFile('dist-electron/resources/npm/package.json', '{}');
  writeFile('dist-electron/resources/npm/bin/npm-cli.js');
  writeFile('dist-electron/lib/pi/pi-wrapper.sh');
  for (const extensionId of ['automation', 'ide-launcher', 'memory', 'tps-monitor']) {
    const baseDir = `dist-electron/extensions/builtin/${extensionId}/dist`;
    writeFile(`dist-electron/extensions/builtin/${extensionId}/chaton.extension.json`, JSON.stringify({
      id: `@chaton/${extensionId}`,
      ui: {
        mainViews: [{
          viewId: `${extensionId}.main`,
          webviewUrl: `chaton-extension://@chaton/${extensionId}/dist/react-index.html`,
        }],
      },
    }));
    writeFile(`${baseDir}/react-index.html`, '<!doctype html><script type="module" src="./assets/extension-fixture.js"></script>');
    writeFile(`${baseDir}/assets/extension-fixture.js`);
  }
  writeFile('dist-electron/extensions/builtin/tool-only/chaton.extension.json', JSON.stringify({
    id: '@chaton/tool-only',
    capabilities: ['llm.tools'],
  }));

  const rendererReferences = assertReferencedAssetsExist('dist/index.html');
  assertSelfTest(rendererReferences.assets.length === 2, `expected 2 renderer assets, got ${rendererReferences.assets.length}`);
  let missingAssetFailed = false;
  fs.unlinkSync(path.join(repoRoot, 'dist/assets/index-fixture.css'));
  try {
    assertReferencedAssetsExist('dist/index.html');
  } catch {
    missingAssetFailed = true;
  }
  assertSelfTest(missingAssetFailed, 'missing referenced renderer asset should fail');
  writeFile('dist/assets/index-fixture.css');

  let missingReferenceFailed = false;
  writeFile('dist/no-assets.html', '<!doctype html><main>No local assets</main>');
  try {
    assertReferencedAssetsExist('dist/no-assets.html');
  } catch {
    missingReferenceFailed = true;
  }
  assertSelfTest(missingReferenceFailed, 'HTML without local assets should fail');

  const manifestHtmlFiles = getBuiltinMainViewHtmlFiles();
  assertSelfTest(manifestHtmlFiles.length === 4, `expected 4 manifest-driven built-in views, got ${manifestHtmlFiles.length}`);
  assertSelfTest(manifestHtmlFiles.every((item) => item.htmlPath.endsWith('/dist/react-index.html')), 'manifest-driven built-in views should point at dist/react-index.html');

  const invalidWebviewCases = [
    { name: 'external-url', url: 'https://example.com/view.html' },
    { name: 'wrong-extension-id', url: 'chaton-extension://@chaton/other/dist/react-index.html' },
    { name: 'missing-path', url: 'chaton-extension://@chaton/broken/' },
  ];
  for (const testCase of invalidWebviewCases) {
    writeFile(`dist-electron/extensions/builtin/broken/chaton.extension.json`, JSON.stringify({
      id: '@chaton/broken',
      ui: {
        mainViews: [{ viewId: `broken.${testCase.name}`, webviewUrl: testCase.url }],
      },
    }));
    let failed = false;
    try {
      getBuiltinMainViewHtmlFiles();
    } catch {
      failed = true;
    }
    assertSelfTest(failed, `invalid webviewUrl fixture should fail: ${testCase.name}`);
    fs.rmSync(path.join(repoRoot, 'dist-electron/extensions/builtin/broken'), { recursive: true, force: true });
  }

  console.log(JSON.stringify({ ok: true, selfTest: 'fixtures', repoRoot }, null, 2));
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
  throw new Error(`Unknown build output smoke self-test: ${selfTest}`);
}

const files = requiredFiles.map(assertFile);

const rendererHtml = fs.readFileSync(path.join(repoRoot, 'dist/index.html'), 'utf8');
assertCondition(/<script\b[^>]*\bsrc="\.\/assets\/[^\"]+\.js"/.test(rendererHtml), 'dist/index.html does not reference a renderer JS asset');
const rendererReferences = assertReferencedAssetsExist('dist/index.html');

const rendererAssets = listFiles('dist/assets');
const rendererJsAssets = rendererAssets.filter((filePath) => /\/index-[^/]+\.js$/.test(filePath));
const rendererCssAssets = rendererAssets.filter((filePath) => /\/index-[^/]+\.css$/.test(filePath));
assertCondition(rendererJsAssets.length > 0, 'Missing dist/assets/index-*.js renderer asset');
assertCondition(rendererCssAssets.length > 0, 'Missing dist/assets/index-*.css renderer asset');

const builtinExtensions = getBuiltinMainViewHtmlFiles().map((mainView) => {
  const reactIndex = assertFile(mainView.htmlPath);
  const references = assertReferencedAssetsExist(mainView.htmlPath);
  const assets = listFiles(path.join(path.dirname(mainView.htmlPath), 'assets'));
  const jsAssets = assets.filter((filePath) => filePath.endsWith('.js'));
  assertCondition(jsAssets.length > 0, `Missing React JS asset for built-in extension view: ${mainView.extensionId}/${mainView.viewId}`);
  return {
    id: mainView.extensionId,
    viewId: mainView.viewId,
    reactIndex,
    references,
    jsAssets,
  };
});
assertCondition(builtinExtensions.length > 0, 'No built-in extension mainView HTML files were discovered from manifests');

console.log(JSON.stringify({
  ok: true,
  repoRoot,
  files,
  renderer: {
    html: 'dist/index.html',
    references: rendererReferences,
    jsAssets: rendererJsAssets,
    cssAssets: rendererCssAssets,
  },
  builtinExtensions,
}, null, 2));
