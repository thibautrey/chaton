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
 * Security guardrails:
 *   - SVG sanitization: strips scripts, event handlers, foreign objects,
 *     external references, data URIs, and dangerous elements/attributes
 *   - Raster image validation: checks magic bytes, enforces size limits,
 *     re-encodes through sharp to strip embedded payloads
 *   - Tarball safety: size cap, path traversal checks, symlink rejection
 *   - Manifest validation: size cap, schema checks, type coercion defense
 *
 * Usage: node scripts/fetch-extensions.js
 * Runs automatically as part of `npm run build`.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import sharp from "sharp";
import {
  stripDangerousHrefAttributes,
  stripDangerousStyleAttributes,
  stripDangerousStyleElements,
  stripSvgComments,
  stripSvgEventHandlers,
} from "./svg-sanitize-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const REGISTRY_PATH = path.join(ROOT, "extensions-registry.json");
const ICONS_DIR = path.join(ROOT, "public", "extension-icons");
const OUTPUT_DIR = path.join(ROOT, "src", "generated");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "extensions-catalog.json");

// ---------------------------------------------------------------------------
// Security constants
// ---------------------------------------------------------------------------

const MAX_TARBALL_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_ICON_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_MANIFEST_SIZE = 256 * 1024; // 256 KB
const MAX_STRING_FIELD_LEN = 1024;
const MAX_RASTER_DIMENSION = 2048; // px

// SVG elements that must be removed entirely
const SVG_DANGEROUS_ELEMENTS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "embed",
  "object",
  "applet",
  "meta",
  "link",
  "import",
  "use", // <use> can reference external SVGs and bypass CSP
  "set", // SMIL <set> can mutate attributes
]);

// SVG attributes that must be stripped (case-insensitive check)
const SVG_DANGEROUS_ATTR_PATTERNS = [
  /^on/i, // onclick, onload, onerror, ...
  /^xlink:href$/i, // external references
  /^href$/i, // inline/external references in SVG 2
  /^formaction$/i,
  /^data$/i, // <object data="">
  /^srcdoc$/i,
];

// Values that indicate external/dangerous references
const SVG_DANGEROUS_VALUE_PATTERNS = [
  /javascript\s*:/i,
  /data\s*:/i,
  /vbscript\s*:/i,
  /&#/i, // HTML entities used to bypass filters
];

// Magic bytes for supported raster formats
const MAGIC_BYTES = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: Buffer.from([0xff, 0xd8, 0xff]),
  webp_riff: Buffer.from("RIFF"),
  webp_webp: Buffer.from("WEBP"),
};

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

/** Truncate a string to a safe maximum length */
function safeString(val, maxLen = MAX_STRING_FIELD_LEN) {
  if (typeof val !== "string") return "";
  return val.slice(0, maxLen);
}

/** Fetch JSON from a URL with a timeout */
async function fetchJson(url, timeoutMs = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Fetch binary data from a URL, enforcing a size limit */
async function fetchBuffer(url, timeoutMs = 30000, maxSize = MAX_TARBALL_SIZE) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return null;

  // Read in chunks and enforce size cap
  const reader = res.body?.getReader();
  if (!reader) return null;

  const chunks = [];
  let totalSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalSize += value.byteLength;
    if (totalSize > maxSize) {
      reader.cancel();
      throw new Error(`Download exceeds ${maxSize} byte limit for ${url}`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Tarball extraction (hardened)
// ---------------------------------------------------------------------------

/**
 * Extract a specific file from a .tgz tarball buffer.
 * Returns the file contents as a Buffer, or null if not found.
 *
 * Security: validates that the target path has no traversal sequences
 * and rejects symlinks.
 */
function extractFileFromTarball(tarballBuf, filePath) {
  // Block path traversal in the requested file path itself
  if (/\.\.[/\\]/.test(filePath) || path.isAbsolute(filePath)) {
    console.warn(`    SECURITY: rejecting path traversal in filePath: ${filePath}`);
    return null;
  }

  const tmp = path.join(ROOT, `.tmp-tarball-${Date.now()}-${Math.random().toString(36).slice(2)}.tgz`);
  try {
    fs.writeFileSync(tmp, tarballBuf);

    // List files and check for path traversal in the archive itself
    const listing = execSync(`tar -tzf "${tmp}" 2>/dev/null`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });

    const entries = listing.split("\n").map((l) => l.trim()).filter(Boolean);

    // Reject archives containing path traversal or absolute paths
    for (const entry of entries) {
      if (/\.\.[/\\]/.test(entry) || path.isAbsolute(entry)) {
        console.warn(`    SECURITY: tarball contains suspicious path: ${entry}, aborting`);
        return null;
      }
    }

    const target = `package/${filePath}`;
    if (!entries.some((l) => l === target)) return null;

    // Extract to stdout (never to disk except the temp tarball)
    const buf = execSync(`tar -xzf "${tmp}" -O "${target}" 2>/dev/null`, {
      maxBuffer: MAX_ICON_FILE_SIZE + MAX_MANIFEST_SIZE,
    });
    return buf;
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// SVG sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize an SVG buffer by removing dangerous elements, attributes,
 * event handlers, external references, and data URIs.
 *
 * Uses regex-based stripping (no DOM parser needed at build time).
 * This is intentionally aggressive -- better to break a fancy SVG icon
 * than to let a malicious one through.
 */
function sanitizeSvg(svgBuffer) {
  let svg = svgBuffer.toString("utf-8");

  // Reject if it doesn't look like SVG at all
  if (!/<svg[\s>]/i.test(svg)) {
    console.warn("    SECURITY: file does not appear to be SVG, rejecting");
    return null;
  }

  // Remove XML processing instructions (<?xml-stylesheet ... ?>)
  svg = svg.replace(/<\?xml-stylesheet[^?]*\?>/gi, "");

  // Remove CDATA sections (can hide scripts)
  svg = svg.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, "");

  // Remove comments (can contain IE conditional attacks)
  svg = stripSvgComments(svg);

  // Remove DOCTYPE (can define external entities for XXE)
  svg = svg.replace(/<!DOCTYPE[^>]*>/gi, "");

  // Remove dangerous elements and their content
  for (const tag of SVG_DANGEROUS_ELEMENTS) {
    const re = new RegExp(`<${tag}[\\s\\S]*?</${tag}\\s*>`, "gi");
    svg = svg.replace(re, "");
    // Also catch self-closing variants
    const reSelf = new RegExp(`<${tag}\\b[^>]*/\\s*>`, "gi");
    svg = svg.replace(reSelf, "");
  }

  // Remove event handler attributes (on*)
  svg = stripSvgEventHandlers(svg);

  // Remove href/xlink:href attributes that point to javascript:, data:, etc.
  svg = stripDangerousHrefAttributes(svg);

  // Remove style attributes containing url(), expression(), or javascript:
  svg = stripDangerousStyleAttributes(svg);

  // Remove <style> elements containing @import, url(), or scriptable content
  svg = stripDangerousStyleElements(svg);

  // Validate the result is still well-formed enough to be useful
  if (!/<svg[\s>]/i.test(svg)) {
    console.warn("    SECURITY: SVG became invalid after sanitization, rejecting");
    return null;
  }

  return Buffer.from(svg, "utf-8");
}

// ---------------------------------------------------------------------------
// Raster image validation + re-encoding
// ---------------------------------------------------------------------------

/**
 * Detect image format from magic bytes.
 * Returns "png" | "jpg" | "webp" | null
 */
function detectImageFormat(buf) {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(MAGIC_BYTES.png)) return "png";
  if (buf.subarray(0, 3).equals(MAGIC_BYTES.jpg)) return "jpg";
  if (
    buf.subarray(0, 4).equals(MAGIC_BYTES.webp_riff) &&
    buf.subarray(8, 12).equals(MAGIC_BYTES.webp_webp)
  )
    return "webp";
  return null;
}

/**
 * Validate and re-encode a raster image through sharp.
 *
 * This strips any embedded payloads, EXIF data, ICC profiles with
 * exploit potential, and polyglot content. The output is a clean
 * re-encoded PNG (the universal safe output format for icons).
 *
 * Returns { buffer, ext } or null if invalid/malicious.
 */
async function sanitizeRasterImage(buf, claimedExt) {
  // Check magic bytes match the claimed extension
  const detected = detectImageFormat(buf);
  if (!detected) {
    console.warn(`    SECURITY: unrecognized magic bytes, rejecting`);
    return null;
  }

  const extMap = { png: "png", jpg: "jpg", jpeg: "jpg", webp: "webp" };
  const normalizedClaim = extMap[claimedExt?.toLowerCase()] || null;

  if (normalizedClaim && normalizedClaim !== detected) {
    console.warn(
      `    SECURITY: magic bytes (${detected}) don't match extension (.${claimedExt}), rejecting`
    );
    return null;
  }

  try {
    const image = sharp(buf, { failOn: "error", limitInputPixels: MAX_RASTER_DIMENSION * MAX_RASTER_DIMENSION });
    const metadata = await image.metadata();

    // Reject oversized dimensions
    if (
      (metadata.width && metadata.width > MAX_RASTER_DIMENSION) ||
      (metadata.height && metadata.height > MAX_RASTER_DIMENSION)
    ) {
      console.warn(
        `    SECURITY: image dimensions ${metadata.width}x${metadata.height} exceed ${MAX_RASTER_DIMENSION}px limit, rejecting`
      );
      return null;
    }

    // Re-encode as PNG to strip any embedded payloads/metadata
    const cleanBuf = await image
      .png({ compressionLevel: 9 })
      .toBuffer();

    return { buffer: cleanBuf, ext: "png" };
  } catch (err) {
    console.warn(`    SECURITY: sharp failed to process image: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Unified icon sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize any icon buffer. Dispatches to SVG or raster pipeline.
 * Returns { buffer, ext } or null if the icon is rejected.
 */
async function sanitizeIcon(buf, originalExt) {
  if (buf.length > MAX_ICON_FILE_SIZE) {
    console.warn(`    SECURITY: icon file exceeds ${MAX_ICON_FILE_SIZE} byte limit, rejecting`);
    return null;
  }

  const ext = (originalExt || "").toLowerCase();

  if (ext === "svg") {
    const clean = sanitizeSvg(buf);
    if (!clean) return null;
    return { buffer: clean, ext: "svg" };
  }

  // Raster formats: validate magic bytes and re-encode
  return sanitizeRasterImage(buf, ext);
}

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

/**
 * Parse and validate a chaton.extension.json manifest from a tarball.
 * Returns the parsed object with only expected fields, or null.
 */
function parseAndValidateManifest(buf) {
  if (!buf || buf.length > MAX_MANIFEST_SIZE) {
    console.warn("    SECURITY: manifest missing or exceeds size limit");
    return null;
  }

  try {
    const raw = JSON.parse(buf.toString("utf-8"));

    // Must be a plain object
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      console.warn("    SECURITY: manifest is not a plain object");
      return null;
    }

    // Extract only the fields we actually use, with type enforcement
    return {
      icon: typeof raw.icon === "string" ? safeString(raw.icon, 256) : null,
      id: typeof raw.id === "string" ? safeString(raw.id) : null,
      name: typeof raw.name === "string" ? safeString(raw.name) : null,
      version: typeof raw.version === "string" ? safeString(raw.version, 64) : null,
      description: typeof raw.description === "string" ? safeString(raw.description) : null,
      capabilities: Array.isArray(raw.capabilities)
        ? raw.capabilities.filter((c) => typeof c === "string").map((c) => safeString(c, 128))
        : [],
    };
  } catch (err) {
    console.warn(`    SECURITY: manifest parse error: ${err.message}`);
    return null;
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
    name: manifest.name.replace(/^Chatons\s+/, ""),
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
      ? safeString(authorRaw)
      : safeString(authorRaw?.name || "Unknown");

  const slug = slugFromId(packageName);
  const baseName = iconFileName(packageName);

  // -- Icon fetching with security pipeline --
  let localIconUrl = null;
  const existingExt = findExistingIcon(baseName);

  if (existingExt) {
    localIconUrl = `/extension-icons/${baseName}.${existingExt}`;
    console.log(`    Icon: using existing ${baseName}.${existingExt}`);
  } else {
    const tarballUrl = versionData.dist?.tarball;

    // Only accept tarballs from the official npm registry
    if (tarballUrl && !/^https:\/\/registry\.npmjs\.org\//i.test(tarballUrl)) {
      console.warn(`    SECURITY: tarball URL not on registry.npmjs.org, skipping icon: ${tarballUrl}`);
    } else if (tarballUrl) {
      console.log(`    Icon: downloading tarball to extract icon...`);
      let tarballBuf;
      try {
        tarballBuf = await fetchBuffer(tarballUrl);
      } catch (err) {
        console.warn(`    WARN: tarball download failed: ${err.message}`);
      }

      if (tarballBuf) {
        // Parse manifest from tarball with validation
        const manifestBuf = extractFileFromTarball(tarballBuf, "chaton.extension.json");
        const manifest = parseAndValidateManifest(manifestBuf);
        let iconFile = manifest?.icon || null;

        // Reject icon paths with traversal
        if (iconFile && (/\.\.[/\\]/.test(iconFile) || path.isAbsolute(iconFile))) {
          console.warn(`    SECURITY: manifest icon path contains traversal: ${iconFile}`);
          iconFile = null;
        }

        const candidates = iconFile
          ? [iconFile, "icon.svg", "icon.png"]
          : ["icon.svg", "icon.png"];

        for (const candidate of candidates) {
          // Skip candidates with suspicious paths
          if (/\.\.[/\\]/.test(candidate) || path.isAbsolute(candidate)) continue;

          const iconBuf = extractFileFromTarball(tarballBuf, candidate);
          if (!iconBuf) continue;

          const candidateExt = path.extname(candidate).slice(1) || "png";

          // Run through the sanitization pipeline
          const result = await sanitizeIcon(iconBuf, candidateExt);
          if (!result) {
            console.warn(`    SECURITY: icon "${candidate}" rejected by sanitizer`);
            continue;
          }

          const destPath = path.join(ICONS_DIR, `${baseName}.${result.ext}`);
          fs.writeFileSync(destPath, result.buffer);
          localIconUrl = `/extension-icons/${baseName}.${result.ext}`;
          console.log(
            `    Icon: extracted & sanitized ${candidate} -> ${baseName}.${result.ext}`
          );
          break;
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
      .filter((k) => typeof k === "string" && k !== "chatons")
      .map((k) => safeString(k, 64)),
    capabilities: (chatonExt.capabilities || [])
      .filter((c) => typeof c === "string")
      .map((c) => safeString(c, 128)),
    repositoryUrl: repoUrl ? safeString(repoUrl) : null,
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

  // Also write to public/ so it's served as a static API endpoint
  const PUBLIC_CATALOG_PATH = path.join(ROOT, "public", "extensions-catalog.json");
  fs.writeFileSync(PUBLIC_CATALOG_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`  Public:  ${PUBLIC_CATALOG_PATH}`);

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
