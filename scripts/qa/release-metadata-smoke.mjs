import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const releaseDir = path.resolve(process.env.CHATON_RELEASE_DIR ?? path.join(repoRoot, 'release'));
const metadataPath = path.resolve(process.env.CHATON_RELEASE_METADATA_PATH ?? path.join(releaseDir, 'latest-mac.yml'));
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const selfTest = process.env.CHATON_RELEASE_METADATA_SMOKE_SELF_TEST?.trim() || null;

function parseScalarYaml(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (!match) {
      continue;
    }
    result[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return result;
}

function parseNestedSize(text) {
  const match = text.match(/^\s+size:\s*(\d+)$/m);
  return match ? Number(match[1]) : null;
}

function readBlockmap(filePath) {
  const raw = fs.readFileSync(filePath);
  try {
    return { format: 'gzip-json', data: JSON.parse(zlib.gunzipSync(raw).toString('utf8')) };
  } catch (gzipError) {
    try {
      return { format: 'json', data: JSON.parse(raw.toString('utf8')) };
    } catch (jsonError) {
      throw new Error(`Unable to parse blockmap as gzip JSON or JSON: gzip=${gzipError.message}; json=${jsonError.message}`);
    }
  }
}

function assertSelfTest(condition, message) {
  if (!condition) {
    throw new Error(`release-metadata-smoke self-test failed: ${message}`);
  }
}

function runFixtureSelfTest() {
  const quotedMetadata = parseScalarYaml('version: "0.239.0"\npath: \'Chatons-latest-arm64.dmg\'\nreleaseDate: 2026-05-26T00:00:00.000Z\n');
  assertSelfTest(quotedMetadata.version === '0.239.0', 'double-quoted scalar was not parsed');
  assertSelfTest(quotedMetadata.path === 'Chatons-latest-arm64.dmg', 'single-quoted scalar was not parsed');
  assertSelfTest(parseNestedSize('files:\n  - url: Chatons-latest-arm64.dmg\n    size: 12345\n') === 12345, 'nested size was not parsed');
  assertSelfTest(parseNestedSize('files:\n  - url: Chatons-latest-arm64.dmg\n    size: nope\n') === null, 'invalid nested size should not parse');

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chaton-release-metadata-self-test-'));
  try {
    const gzipBlockmapPath = path.join(fixtureRoot, 'gzip.blockmap');
    const jsonBlockmapPath = path.join(fixtureRoot, 'json.blockmap');
    const badBlockmapPath = path.join(fixtureRoot, 'bad.blockmap');
    fs.writeFileSync(gzipBlockmapPath, zlib.gzipSync(JSON.stringify({ version: '2', files: [{ name: 'artifact' }] })));
    fs.writeFileSync(jsonBlockmapPath, JSON.stringify({ version: '2', files: [{ name: 'artifact' }] }));
    fs.writeFileSync(badBlockmapPath, 'not-json');
    assertSelfTest(readBlockmap(gzipBlockmapPath).format === 'gzip-json', 'gzip blockmap was not detected');
    assertSelfTest(readBlockmap(jsonBlockmapPath).format === 'json', 'plain JSON blockmap was not detected');
    let threw = false;
    try {
      readBlockmap(badBlockmapPath);
    } catch {
      threw = true;
    }
    assertSelfTest(threw, 'invalid blockmap should throw');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ ok: true, selfTest: 'fixtures' }, null, 2));
}

if (selfTest === 'fixtures') {
  runFixtureSelfTest();
  process.exit(0);
}

if (selfTest) {
  throw new Error(`Unknown release metadata smoke self-test: ${selfTest}`);
}

if (!fs.existsSync(metadataPath)) {
  throw new Error(`Release metadata not found: ${metadataPath}`);
}

const metadataText = fs.readFileSync(metadataPath, 'utf8');
const metadata = parseScalarYaml(metadataText);
const artifactName = metadata.path;
if (!artifactName) {
  throw new Error(`Release metadata is missing path: ${metadataPath}`);
}

const artifactPath = path.join(path.dirname(metadataPath), artifactName);
const blockmapPath = `${artifactPath}.blockmap`;
if (!fs.existsSync(artifactPath)) {
  throw new Error(`Release artifact referenced by metadata is missing: ${artifactPath}`);
}
if (!fs.existsSync(blockmapPath)) {
  throw new Error(`Release blockmap is missing: ${blockmapPath}`);
}

const artifact = fs.readFileSync(artifactPath);
const artifactStat = fs.statSync(artifactPath);
const actualSha512 = crypto.createHash('sha512').update(artifact).digest('base64');
const metadataSize = parseNestedSize(metadataText);
const blockmap = readBlockmap(blockmapPath);
const blockmapStat = fs.statSync(blockmapPath);

const checks = {
  versionMatchesPackage: metadata.version === packageJson.version,
  pathMatchesExistingArtifact: path.basename(artifactPath) === artifactName,
  sha512MatchesArtifact: metadata.sha512 === actualSha512,
  nestedFileSha512MatchesArtifact: metadataText.includes(`sha512: ${actualSha512}`),
  sizeMatchesArtifact: metadataSize === artifactStat.size,
  blockmapHasFiles: Array.isArray(blockmap.data.files) && blockmap.data.files.length > 0,
  blockmapVersionPresent: typeof blockmap.data.version === 'string' && blockmap.data.version.length > 0,
};
const ok = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  ok,
  releaseDir,
  metadataPath,
  packageVersion: packageJson.version,
  metadata: {
    version: metadata.version,
    path: metadata.path,
    releaseDate: metadata.releaseDate,
    sha512: metadata.sha512,
    size: metadataSize,
  },
  artifact: {
    path: artifactPath,
    sizeBytes: artifactStat.size,
    modifiedAt: artifactStat.mtime.toISOString(),
    sha512: actualSha512,
  },
  blockmap: {
    path: blockmapPath,
    sizeBytes: blockmapStat.size,
    modifiedAt: blockmapStat.mtime.toISOString(),
    format: blockmap.format,
    files: Array.isArray(blockmap.data.files) ? blockmap.data.files.length : null,
    version: blockmap.data.version ?? null,
  },
  checks,
}, null, 2));

if (!ok) {
  process.exit(1);
}
