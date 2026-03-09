#!/usr/bin/env node
/**
 * Build-time script that reads extensions-registry.json and produces:
 *   1. src/generated/extensions-catalog.json  -- full extension metadata
 *   2. public/extension-icons/*               -- downloaded icons
 *
 * Data sources:
 *   - Builtin extensions: read from local chaton.extension.json manifests
 *   - npm extensions: fetched from the npm registry + tarball for icons
 *
 * Usage: node scripts/fetch-extensions.js
 * Runs automatically as part of `npm run build`.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const REGISTRY_PATH = path.join(ROOT, "extensions-registry.json");
const ICONS_DIR = path.join(ROOT, "public", "extension-icons");
const OUTPUT_DIR = path.join(ROOT, "src", "generated");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "extensions-catalog.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitize a package id into a filename-safe string: @scope/name -> @scope-name */
function iconFileName(id) {
  return id.replace(/\//g, "-");
}

/** Derive a URL-friendly slug from an npm package name */
function slugFromId(id) {
  return id
    .replace(/^@[^/]+\/chatons-(channel|extension)-/, "")
    .replace(/^@[^/]+\//, "");
}

/** Derive a human-readable display name from the package name */
function displayName(raw) {
  return raw
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Detect the category from a package id or chatonExtension.kind */
function detectCategory(id, kind) {
  if (kind === "channel" || /chatons-channel-/.test(id)) return "channel";
  return "tool";
}

/** Fetch JSON from a URL with a timeout */
async function fetchJson(url, timeoutMs = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Fetch binary data from a URL */
async function fetchBuffer(url, timeoutMs = 30000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Try to extract a specific file from a .tgz tarball buffer.
 * Returns the file contents as a Buffer, or null if not found.
 * Uses tar via a temp file for simplicity.
 */
function extractFileFromTarball(tarballBuf, filePath) {
  const tmp = path.join(ROOT, `.tmp-tarball-${Date.now()}.tgz`);
  try {
    fs.writeFileSync(tmp, tarballBuf);
    // List files first to check existence
    const listing = execSync(`tar -tzf "${tmp}" 2>/dev/null`, {
      encoding: "utf-8",
    });
    const target = `package/${filePath}`;
    if (!listing.split("\n").some((l) => l.trim() === target)) return null;

    // Extract to stdout
    const buf = execSync(`tar -xzf "${tmp}" -O "${target}" 2>/dev/null`);
    return buf;
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

/** Find the icon extension for an existing local icon */
function findExistingIcon(baseName) {
  for (const ext of ["svg", "png", "jpg", "webp"]) {
    const p = path.join(ICONS_DIR, `${baseName}.${ext}`);
    if (fs.existsSync(p)) return ext;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Process builtin extensions
// ---------------------------------------------------------------------------

async function processBuiltin(entry) {
  const manifestPath = path.resolve(ROOT, entry.manifestPath);
  if (!fs.existsSync(manifestPath)) {
    console.warn(`  WARN: manifest not found at ${manifestPath}, skipping`);
    return null;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const slug = slugFromId(manifest.id);
  const baseName = iconFileName(manifest.id);
  const existingExt = findExistingIcon(baseName);
  const localIconUrl = existingExt
    ? `/extension-icons/${baseName}.${existingExt}`
    : null;

  return {
    id: manifest.id,
    slug,
    name: manifest.name.replace(/^Chatons\s+/, ""), // "Chatons Automation" -> "Automation"
    version: manifest.version,
    description: entry.description || manifest.description || "",
    category: "builtin",
    author: "Chatons",
    license: "MIT",
    keywords: entry.keywords || [],
    capabilities: manifest.capabilities || [],
    repositoryUrl: null,
    npmUrl: "",
    iconUrl: localIconUrl,
  };
}

// ---------------------------------------------------------------------------
// Process npm extensions
// ---------------------------------------------------------------------------

async function processNpm(packageName) {
  console.log(`  Fetching ${packageName} ...`);

  let registryData;
  try {
    registryData = await fetchJson(
      `https://registry.npmjs.org/${packageName}`
    );
  } catch (err) {
    console.warn(`  WARN: could not fetch ${packageName}: ${err.message}`);
    return null;
  }

  const latest = registryData["dist-tags"]?.latest;
  if (!latest) {
    console.warn(`  WARN: no latest version for ${packageName}`);
    return null;
  }

  const versionData = registryData.versions?.[latest];
  if (!versionData) {
    console.warn(`  WARN: version ${latest} data missing for ${packageName}`);
    return null;
  }

  const chatons = versionData.chatons || {};
  const chatonExt = versionData.chatonExtension || {};
  const repoUrl = versionData.repository?.url
    ? versionData.repository.url
        .replace(/^git\+/, "")
        .replace(/\.git$/, "")
    : null;

  const authorRaw = versionData.author;
  const author =
    typeof authorRaw === "string"
      ? authorRaw
      : authorRaw?.name || "Unknown";

  const slug = slugFromId(packageName);
  const baseName = iconFileName(packageName);

  // Try to get the icon. Priority:
  // 1. Already exists locally
  // 2. Extract from npm tarball (using chaton.extension.json icon field)
  // 3. Try unpkg for common names
  let localIconUrl = null;
  const existingExt = findExistingIcon(baseName);

  if (existingExt) {
    localIconUrl = `/extension-icons/${baseName}.${existingExt}`;
    console.log(`    Icon: using existing ${baseName}.${existingExt}`);
  } else {
    // Try to extract from tarball
    const tarballUrl = versionData.dist?.tarball;
    if (tarballUrl) {
      console.log(`    Icon: downloading tarball to extract icon...`);
      const tarballBuf = await fetchBuffer(tarballUrl);
      if (tarballBuf) {
        // First check chaton.extension.json for icon field
        const manifestBuf = extractFileFromTarball(
          tarballBuf,
          "chaton.extension.json"
        );
        let iconFile = null;
        if (manifestBuf) {
          try {
            const m = JSON.parse(manifestBuf.toString("utf-8"));
            iconFile = m.icon || null;
          } catch {}
        }

        // Try the icon file from manifest, or common names
        const candidates = iconFile
          ? [iconFile, "icon.svg", "icon.png"]
          : ["icon.svg", "icon.png"];

        for (const candidate of candidates) {
          const iconBuf = extractFileFromTarball(tarballBuf, candidate);
          if (iconBuf) {
            const ext = path.extname(candidate).slice(1) || "png";
            const destPath = path.join(ICONS_DIR, `${baseName}.${ext}`);
            fs.writeFileSync(destPath, iconBuf);
            localIconUrl = `/extension-icons/${baseName}.${ext}`;
            console.log(
              `    Icon: extracted ${candidate} -> ${baseName}.${ext}`
            );
            break;
          }
        }
      }
    }

    if (!localIconUrl) {
      console.log(`    Icon: none found, will use letter fallback`);
    }
  }

  // Derive a nice display name
  const rawSlug = packageName.replace(
    /^@[^/]+\/chatons-(channel|extension)-/,
    ""
  );
  const name =
    chatons.name?.replace(/\s+(Channel|Extension)$/i, "") ||
    displayName(rawSlug);

  return {
    id: packageName,
    slug,
    name,
    version: latest,
    description: versionData.description || "",
    category: detectCategory(packageName, chatonExt.kind),
    author,
    license: versionData.license || "MIT",
    keywords: (versionData.keywords || []).filter((k) => k !== "chatons"),
    capabilities: chatonExt.capabilities || [],
    repositoryUrl: repoUrl,
    npmUrl: `https://www.npmjs.com/package/${packageName}`,
    iconUrl: localIconUrl,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Chatons Extension Catalog Generator ===\n");

  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(`Registry file not found: ${REGISTRY_PATH}`);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));

  // Ensure output directories exist
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const catalog = { builtin: [], channel: [], tool: [] };

  // Process builtins
  console.log("Processing builtin extensions...");
  for (const entry of registry.builtin || []) {
    const ext = await processBuiltin(entry);
    if (ext) {
      catalog.builtin.push(ext);
      console.log(`  OK: ${ext.name} (${ext.version})`);
    }
  }

  // Process npm extensions
  console.log("\nProcessing npm extensions...");
  for (const packageName of registry.npm || []) {
    const ext = await processNpm(packageName);
    if (ext) {
      if (ext.category === "channel") {
        catalog.channel.push(ext);
      } else {
        catalog.tool.push(ext);
      }
    }
  }

  // Write the catalog
  const output = {
    generatedAt: new Date().toISOString(),
    totalCount:
      catalog.builtin.length + catalog.channel.length + catalog.tool.length,
    builtin: catalog.builtin,
    channel: catalog.channel,
    tool: catalog.tool,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  console.log(`\n=== Done ===`);
  console.log(`  Builtin: ${catalog.builtin.length}`);
  console.log(`  Channel: ${catalog.channel.length}`);
  console.log(`  Tool:    ${catalog.tool.length}`);
  console.log(`  Total:   ${output.totalCount}`);
  console.log(`  Output:  ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
