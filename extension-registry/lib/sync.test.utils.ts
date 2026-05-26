/**
 * Tarball fixture builder for sync.ts tests.
 *
 * IMPORTANT: This file is NOT a test file. It is imported as a utility,
 * so vi.mock calls in test files do NOT affect this module.
 * This allows us to use the REAL node:zlib for building test fixtures.
 */

import { gzipSync } from "node:zlib";

/**
 * Build a raw (uncompressed) POSIX tar buffer from entries.
 * Accepts string or Buffer content; Buffer content preserves raw bytes.
 */
export function buildRawTar(
  entries: { name: string; content: string | Buffer | Uint8Array }[]
): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const buf = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content);
    const hdr = Buffer.alloc(512);
    hdr.write(entry.name.slice(0, 100), 0, 100, "utf-8");
    hdr.write("0644\0\0\0\0", 100, 8, "utf-8");
    hdr.write("000000\0", 108, 8, "utf-8");
    hdr.write("000000\0", 116, 8, "utf-8");
    hdr.write(buf.length.toString(8).padStart(11, "0") + " ", 124, 12, "utf-8");
    hdr.write("000000\0", 136, 12, "utf-8");
    hdr.write("        ", 148, 8, "utf-8");
    hdr[156] = 48;
    chunks.push(hdr, buf);
    const pad = (512 - (buf.length % 512)) % 512;
    if (pad) chunks.push(Buffer.alloc(pad));
  }
  chunks.push(Buffer.alloc(512), Buffer.alloc(512));
  return Buffer.concat(chunks);
}

/**
 * Build a valid gzip-wrapped POSIX tar from file entries.
 * Uses gzipSync (real node:zlib) for correct gzip encoding.
 */
export function buildGzTar(
  entries: { name: string; content: string | Buffer | Uint8Array }[]
): Buffer {
  const tar = buildRawTar(entries);
  return gzipSync(tar);
}
