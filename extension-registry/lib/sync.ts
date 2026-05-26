import { gunzipSync } from "node:zlib";

/**
 * Core sync logic: fetches extension metadata and icons from npm,
 * combines with builtin definitions, and produces an ExtensionCatalog.
 *
 * Storage-agnostic: callers provide save/load callbacks so this works
 * both in Vercel (Blob) and locally (filesystem).
 */

import type {
  ExtensionEntry,
  ExtensionCatalog,
  RegistrySource,
  BuiltinEntry,
} from "./types.js";

const MAX_STRING_LEN = 1024;
const FETCH_TIMEOUT_MS = 15_000;

// -- Helpers ------------------------------------------------------------------

function safeString(val: unknown, maxLen = MAX_STRING_LEN): string {
  if (typeof val !== "string") return "";
  return val.slice(0, maxLen);
}

function slugFromId(id: string): string {
  return id
    .replace(/^@[^/]+\/chatons-(channel|extension)-/, "")
    .replace(/^@[^/]+\//, "");
}

function displayName(raw: string): string {
  return raw
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function detectCategory(
  id: string,
  kind?: string
): "channel" | "tool" {
  if (kind === "channel" || /chatons-channel-/.test(id)) return "channel";
  return "tool";
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// -- Icon extraction from npm tarball -----------------------------------------

/**
 * Try to fetch the icon declared in the chaton manifest from the npm tarball.
 * Returns { buffer, contentType } or null.
 *
 * We use the npm tarball API to download only the specific files we need
 * by streaming through the tarball. For simplicity, we fetch the full tarball
 * and extract in-memory (icons and manifests are small).
 */
async function fetchIconFromTarball(
  tarballUrl: string
): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> {
  // Only accept tarballs from the official npm registry
  if (!/^https:\/\/registry\.npmjs\.org\//i.test(tarballUrl)) {
    console.warn(`  SECURITY: tarball URL not on registry.npmjs.org: ${tarballUrl}`);
    return null;
  }

  try {
    const res = await fetch(tarballUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;

    const arrayBuf = await res.arrayBuffer();
    const tarballBuf = Buffer.from(arrayBuf);

    // We need to extract files from the tgz. Use a simple approach:
    // decompress with DecompressionStream, then parse the tar format.
    const files = await extractTarGz(tarballBuf);

    // First look for the manifest to find the icon path
    const manifestFile = files.get("package/chaton.extension.json");
    let iconPath = "icon.svg";

    if (manifestFile) {
      try {
        const manifest = JSON.parse(manifestFile.toString("utf-8"));
        if (typeof manifest.icon === "string" && manifest.icon.length < 256) {
          iconPath = manifest.icon;
        }
      } catch {
        // ignore parse errors
      }
    }

    // Try the declared icon, then fallbacks
    const candidates = [iconPath, "icon.svg", "icon.png"];
    const seen = new Set<string>();

    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);

      // Reject path traversal
      if (/\.\.[/\\]/.test(candidate)) continue;

      const buf = files.get(`package/${candidate}`);
      if (!buf || buf.length === 0) continue;

      const ext = candidate.split(".").pop()?.toLowerCase() || "png";
      const contentType =
        ext === "svg"
          ? "image/svg+xml"
          : ext === "png"
          ? "image/png"
          : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "webp"
          ? "image/webp"
          : "application/octet-stream";

      // Basic SVG sanitization: reject if it contains script tags
      if (ext === "svg") {
        const svgText = buf.toString("utf-8");
        if (/<script[\s>]/i.test(svgText) || /on\w+\s*=/i.test(svgText)) {
          console.warn(`  SECURITY: SVG contains script content, skipping`);
          continue;
        }
      }

      return { buffer: buf, contentType, ext };
    }
  } catch (err) {
    console.warn(`  Icon extraction failed: ${(err as Error).message}`);
  }

  return null;
}

/**
 * Minimal tar.gz extractor. Decompresses gzip, then parses POSIX tar headers.
 * Returns a Map of path -> Buffer for all regular files.
 */
function extractTarGz(gzBuf: Buffer): Map<string, Buffer> {
  const tarBuf = gunzipSync(gzBuf);
  const files = new Map<string, Buffer>();

  let offset = 0;
  while (offset < tarBuf.length - 512) {
    const header = tarBuf.subarray(offset, offset + 512);

    // Check for end-of-archive (two zero blocks)
    if (header.every((b) => b === 0)) break;

    // Parse filename from bytes 0-100
    const nameEnd = header.indexOf(0, 0);
    const name = header
      .subarray(0, nameEnd > 0 && nameEnd < 100 ? nameEnd : 100)
      .toString("utf-8")
      .trim();

    // Parse file size from bytes 124-136 (octal)
    const sizeStr = header.subarray(124, 136).toString("utf-8").trim();
    const size = parseInt(sizeStr, 8) || 0;

    // Type flag at byte 156: '0' or '\0' = regular file
    const typeFlag = header[156];
    const isFile = typeFlag === 0 || typeFlag === 48; // 48 = '0'

    offset += 512; // move past header

    if (isFile && name && size > 0 && size < 5 * 1024 * 1024) {
      files.set(name, Buffer.from(tarBuf.subarray(offset, offset + size)));
    }

    // Advance by the file data, rounded up to 512-byte blocks
    offset += Math.ceil(size / 512) * 512;
  }

  return files;
}

// -- Process one npm package --------------------------------------------------

export interface SaveIconFn {
  (id: string, buffer: Buffer, contentType: string, ext: string): Promise<string | null>;
}

async function processNpmPackage(
  packageName: string,
  saveIcon: SaveIconFn
): Promise<ExtensionEntry | null> {
  console.log(`  Fetching ${packageName} ...`);

  let registryData: any;
  try {
    registryData = await fetchJson(
      `https://registry.npmjs.org/${packageName}`
    );
  } catch (err) {
    console.warn(`  WARN: could not fetch ${packageName}: ${(err as Error).message}`);
    return null;
  }

  const latest = registryData["dist-tags"]?.latest;
  if (!latest) {
    console.warn(`  WARN: no latest version for ${packageName}`);
    return null;
  }

  const versionData = registryData.versions?.[latest];
  if (!versionData) {
    console.warn(`  WARN: version ${latest} data missing`);
    return null;
  }

  const chatonExt = versionData.chatonExtension || {};
  const repoUrl = versionData.repository?.url
    ? versionData.repository.url.replace(/^git\+/, "").replace(/\.git$/, "")
    : null;

  const authorRaw = versionData.author;
  const author =
    typeof authorRaw === "string"
      ? safeString(authorRaw)
      : safeString(authorRaw?.name || "Unknown");

  const slug = slugFromId(packageName);

  // Fetch icon from tarball
  let iconUrl: string | null = null;
  const tarballUrl = versionData.dist?.tarball;
  if (tarballUrl) {
    const icon = await fetchIconFromTarball(tarballUrl);
    if (icon) {
      iconUrl = await saveIcon(packageName, icon.buffer, icon.contentType, icon.ext);
    }
  }

  const rawSlug = packageName.replace(
    /^@[^/]+\/chatons-(channel|extension)-/,
    ""
  );

  const chatons = versionData.chatons || {};
  const name =
    chatonExt.name ||
    safeString(chatons.name?.replace(/\s+(Channel|Extension)$/i, "")) ||
    displayName(rawSlug);

  return {
    id: packageName,
    slug,
    name,
    version: safeString(latest, 64),
    description: safeString(versionData.description || ""),
    category: detectCategory(packageName, chatonExt.kind),
    author,
    license: safeString(versionData.license || "MIT", 64),
    keywords: (versionData.keywords || [])
      .filter((k: unknown) => typeof k === "string" && k !== "chatons")
      .map((k: string) => safeString(k, 64)),
    capabilities: (chatonExt.capabilities || [])
      .filter((c: unknown) => typeof c === "string")
      .map((c: string) => safeString(c, 128)),
    repositoryUrl: repoUrl ? safeString(repoUrl) : null,
    npmUrl: `https://www.npmjs.com/package/${packageName}`,
    iconUrl,
  };
}

// -- Process builtin extensions -----------------------------------------------

function processBuiltin(entry: BuiltinEntry): ExtensionEntry {
  return {
    id: entry.id,
    slug: slugFromId(entry.id),
    name: entry.name,
    version: entry.version,
    description: entry.description,
    category: "builtin",
    author: "Chatons",
    license: "MIT",
    keywords: entry.keywords || [],
    capabilities: entry.capabilities || [],
    repositoryUrl: entry.repositoryUrl || null,
    npmUrl: entry.npmUrl || "",
    iconUrl: entry.iconUrl || null,
  };
}

// -- Main sync entry point ----------------------------------------------------

export interface SyncOptions {
  registry: RegistrySource;
  saveIcon: SaveIconFn;
}

export async function syncExtensions(
  opts: SyncOptions
): Promise<ExtensionCatalog> {
  const { registry, saveIcon } = opts;

  console.log("=== Chatons Extension Registry Sync ===\n");

  const catalog: ExtensionCatalog = {
    generatedAt: new Date().toISOString(),
    totalCount: 0,
    builtin: [],
    channel: [],
    tool: [],
  };

  // Process builtins
  console.log("Processing builtin extensions...");
  for (const entry of registry.builtin || []) {
    const ext = processBuiltin(entry);
    catalog.builtin.push(ext);
    console.log(`  OK: ${ext.name} (${ext.version})`);
  }

  // Process npm packages (in parallel, batched to avoid rate limits)
  console.log("\nProcessing npm extensions...");
  const npmPackages = [
    ...(registry.npm || []),
    ...(registry.autoDiscoveredNpm || []),
  ];
  const BATCH_SIZE = 5;

  for (let i = 0; i < npmPackages.length; i += BATCH_SIZE) {
    const batch = npmPackages.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((pkg) => processNpmPackage(pkg, saveIcon))
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        const ext = result.value;
        if (ext.category === "channel") {
          catalog.channel.push(ext);
        } else {
          catalog.tool.push(ext);
        }
        console.log(`  OK: ${ext.name} (${ext.version})`);
      } else if (result.status === "rejected") {
        console.warn(`  FAIL: ${(result.reason as Error).message}`);
      }
    }
  }

  catalog.totalCount =
    catalog.builtin.length + catalog.channel.length + catalog.tool.length;

  console.log(`\n=== Sync complete ===`);
  console.log(`  Builtin: ${catalog.builtin.length}`);
  console.log(`  Channel: ${catalog.channel.length}`);
  console.log(`  Tool:    ${catalog.tool.length}`);
  console.log(`  Total:   ${catalog.totalCount}`);

  return catalog;
}
