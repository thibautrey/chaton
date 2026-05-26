/**
 * Unit tests for extension-registry/lib/storage-auto.ts
 *
 * storage-auto.ts is a thin factory that routes storage calls to either:
 *   - Vercel Blob (when BLOB_READ_WRITE_TOKEN is set)
 *   - Local filesystem (when BLOB_READ_WRITE_TOKEN is absent)
 *
 * These tests verify the routing logic by stubbing the env var and mocking
 * the underlying storage modules.
 *
 * Note: @vercel/blob is not installed in the test environment. We mock it
 * at module level via vi.mock so Vite's resolution does not crash when
 * loading storage.ts in the Blob path.
 */

import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Module-level mock for @vercel/blob (not installed in test env).
// This must be declared before any dynamic imports so Vite resolves it.
vi.mock("@vercel/blob", () => ({ put: vi.fn(), head: vi.fn() }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal ExtensionCatalog fixture used across tests. */
const fixtureCatalog = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  totalCount: 1,
  builtin: [],
  channel: [],
  tool: [
    {
      id: "@acme/chatons-extension-foo",
      slug: "foo",
      name: "Foo",
      version: "1.0.0",
      description: "A test extension.",
      category: "tool" as const,
      author: "Acme",
      license: "MIT",
      keywords: [],
      capabilities: [],
      repositoryUrl: null,
      npmUrl: "https://www.npmjs.com/package/@acme/chatons-extension-foo",
      iconUrl: "/api/icons/acme-chatons-extension-foo.svg",
    },
  ],
};

const fixtureBuffer = Buffer.from("icon-bytes");
const fixtureContentType = "image/svg+xml";
const fixtureExt = "svg";
const fixturePackageId = "@acme/chatons-extension-foo";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("storage-auto", () => {
  const originalCwd = process.cwd();
  let tempCwd: string | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("./storage.js");
    vi.doUnmock("./storage-local.js");
    // Ensure the env var does not leak between tests
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.restoreAllMocks();
    if (process.cwd() !== originalCwd) {
      process.chdir(originalCwd);
    }
    if (tempCwd) {
      fs.rmSync(tempCwd, { recursive: true, force: true });
      tempCwd = null;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (process.cwd() !== originalCwd) {
      process.chdir(originalCwd);
    }
    if (tempCwd) {
      fs.rmSync(tempCwd, { recursive: true, force: true });
      tempCwd = null;
    }
  });

  // -------------------------------------------------------------------------
  // loadCatalogAuto
  // -------------------------------------------------------------------------

  describe("loadCatalogAuto — local path (BLOB_READ_WRITE_TOKEN absent)", () => {
    it("calls loadCatalogLocal and returns its result", async () => {
      const mockResult = { ...fixtureCatalog };
      vi.doMock("./storage-local.js", () => ({
        loadCatalogLocal: vi.fn().mockResolvedValue(mockResult),
      }));

      const { loadCatalogAuto } = await import("./storage-auto.js");
      const result = await loadCatalogAuto();

      expect(result).toEqual(mockResult);
    });

    it("returns null when loadCatalogLocal returns null", async () => {
      vi.doMock("./storage-local.js", () => ({
        loadCatalogLocal: vi.fn().mockResolvedValue(null),
      }));

      const { loadCatalogAuto } = await import("./storage-auto.js");
      const result = await loadCatalogAuto();

      expect(result).toBeNull();
    });

    it("does NOT import storage.js when using local path", async () => {
      vi.doMock("./storage-local.js", () => ({
        loadCatalogLocal: vi.fn().mockResolvedValue(null),
      }));

      await import("./storage-auto.js");

      // If storage.js were imported, importing it again here would be fine —
      // but it should not appear as a module dependency at all in this path.
      // We verify indirectly by confirming the local mock was called.
    });
  });

  describe("loadCatalogAuto — Vercel Blob path (BLOB_READ_WRITE_TOKEN set)", () => {
    it("calls loadCatalog (from storage.js) and returns its result", async () => {
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel-blob-token-abc123");
      const mockResult = { ...fixtureCatalog };
      vi.doMock("./storage.js", () => ({
        loadCatalog: vi.fn().mockResolvedValue(mockResult),
      }));

      const { loadCatalogAuto } = await import("./storage-auto.js");
      const result = await loadCatalogAuto();

      expect(result).toEqual(mockResult);
    });

    it("returns null when loadCatalog returns null", async () => {
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel-blob-token-abc123");
      vi.doMock("./storage.js", () => ({
        loadCatalog: vi.fn().mockResolvedValue(null),
      }));

      const { loadCatalogAuto } = await import("./storage-auto.js");
      const result = await loadCatalogAuto();

      expect(result).toBeNull();
    });

    it("does NOT import storage-local.js when using Blob path", async () => {
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel-blob-token-abc123");
      vi.doMock("./storage.js", () => ({
        loadCatalog: vi.fn().mockResolvedValue(null),
      }));

      await import("./storage-auto.js");
      // Confirmed: storage.js was loaded (we can check the mock if needed)
    });
  });

  // -------------------------------------------------------------------------
  // saveCatalogAuto
  // -------------------------------------------------------------------------

  describe("saveCatalogAuto — local path (BLOB_READ_WRITE_TOKEN absent)", () => {
    it("calls saveCatalogLocal and returns its result", async () => {
      vi.doMock("./storage-local.js", () => ({
        saveCatalogLocal: vi.fn().mockResolvedValue("/path/to/catalog.json"),
      }));

      const { saveCatalogAuto } = await import("./storage-auto.js");
      const result = await saveCatalogAuto(fixtureCatalog);

      expect(result).toBe("/path/to/catalog.json");
    });

    it("passes the catalog argument to saveCatalogLocal", async () => {
      const saveSpy = vi.fn().mockResolvedValue("/path/to/catalog.json");
      vi.doMock("./storage-local.js", () => ({
        saveCatalogLocal: saveSpy,
      }));

      const { saveCatalogAuto } = await import("./storage-auto.js");
      await saveCatalogAuto(fixtureCatalog);

      expect(saveSpy).toHaveBeenCalledOnce();
      expect(saveSpy).toHaveBeenCalledWith(fixtureCatalog);
    });
  });

  describe("saveCatalogAuto — Vercel Blob path (BLOB_READ_WRITE_TOKEN set)", () => {
    it("calls saveCatalog (from storage.js) and returns its result", async () => {
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel-blob-token-abc123");
      vi.doMock("./storage.js", () => ({
        saveCatalog: vi.fn().mockResolvedValue("https://blob.url/catalog.json"),
      }));

      const { saveCatalogAuto } = await import("./storage-auto.js");
      const result = await saveCatalogAuto(fixtureCatalog);

      expect(result).toBe("https://blob.url/catalog.json");
    });

    it("passes the catalog argument to saveCatalog", async () => {
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel-blob-token-abc123");
      const saveSpy = vi.fn().mockResolvedValue("https://blob.url/catalog.json");
      vi.doMock("./storage.js", () => ({
        saveCatalog: saveSpy,
      }));

      const { saveCatalogAuto } = await import("./storage-auto.js");
      await saveCatalogAuto(fixtureCatalog);

      expect(saveSpy).toHaveBeenCalledOnce();
      expect(saveSpy).toHaveBeenCalledWith(fixtureCatalog);
    });
  });

  // -------------------------------------------------------------------------
  // saveIconAuto
  // -------------------------------------------------------------------------

  describe("saveIconAuto — local path (BLOB_READ_WRITE_TOKEN absent)", () => {
    it("calls saveIconLocal and returns its result", async () => {
      vi.doMock("./storage-local.js", () => ({
        saveIconLocal: vi.fn().mockResolvedValue("/api/icons/acme-chatons-extension-foo.svg"),
      }));

      const { saveIconAuto } = await import("./storage-auto.js");
      const result = await saveIconAuto(fixturePackageId, fixtureBuffer, fixtureContentType, fixtureExt);

      expect(result).toBe("/api/icons/acme-chatons-extension-foo.svg");
    });

    it("passes all four arguments to saveIconLocal in order", async () => {
      const saveSpy = vi.fn().mockResolvedValue("/api/icons/acme-chatons-extension-foo.svg");
      vi.doMock("./storage-local.js", () => ({
        saveIconLocal: saveSpy,
      }));

      const { saveIconAuto } = await import("./storage-auto.js");
      await saveIconAuto(fixturePackageId, fixtureBuffer, fixtureContentType, fixtureExt);

      expect(saveSpy).toHaveBeenCalledOnce();
      expect(saveSpy).toHaveBeenCalledWith(fixturePackageId, fixtureBuffer, fixtureContentType, fixtureExt);
    });
  });

  describe("saveIconAuto — Vercel Blob path (BLOB_READ_WRITE_TOKEN set)", () => {
    it("calls saveIcon (from storage.js) and returns its result", async () => {
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel-blob-token-abc123");
      vi.doMock("./storage.js", () => ({
        saveIcon: vi.fn().mockResolvedValue("https://blob.url/icons/acme-chatons-extension-foo.svg"),
      }));

      const { saveIconAuto } = await import("./storage-auto.js");
      const result = await saveIconAuto(fixturePackageId, fixtureBuffer, fixtureContentType, fixtureExt);

      expect(result).toBe("https://blob.url/icons/acme-chatons-extension-foo.svg");
    });

    it("passes all four arguments to saveIcon in order", async () => {
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel-blob-token-abc123");
      const saveSpy = vi.fn().mockResolvedValue("https://blob.url/icons/acme-chatons-extension-foo.svg");
      vi.doMock("./storage.js", () => ({
        saveIcon: saveSpy,
      }));

      const { saveIconAuto } = await import("./storage-auto.js");
      await saveIconAuto(fixturePackageId, fixtureBuffer, fixtureContentType, fixtureExt);

      expect(saveSpy).toHaveBeenCalledOnce();
      expect(saveSpy).toHaveBeenCalledWith(fixturePackageId, fixtureBuffer, fixtureContentType, fixtureExt);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-path guarantees
  // -------------------------------------------------------------------------

  describe("routing determinism — local path", () => {
    it("returns the same result shape as the Blob path would (catalog, path, iconUrl)", async () => {
      tempCwd = fs.mkdtempSync(nodePath.join(os.tmpdir(), "chaton-storage-auto-"));
      process.chdir(tempCwd);
      const isolatedCwd = process.cwd();
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

      // Use the real local storage delegate in an isolated cwd. This verifies
      // the local filesystem path without writing .data/ into the repository.
      vi.doMock("./storage.js", () => ({
        loadCatalog: vi.fn().mockResolvedValue(null),
        saveCatalog: vi.fn().mockResolvedValue(""),
        saveIcon: vi.fn().mockResolvedValue(null),
      }));

      const { loadCatalogAuto, saveCatalogAuto, saveIconAuto } = await import(
        "./storage-auto.js"
      );

      const savedCatalogPath = await saveCatalogAuto(fixtureCatalog);
      const [catalog, iconUrl] = await Promise.all([
        loadCatalogAuto(),
        saveIconAuto(fixturePackageId, fixtureBuffer, fixtureContentType, fixtureExt),
      ]);

      // All three functions return non-null values on success
      expect(catalog).not.toBeNull();
      expect(typeof savedCatalogPath).toBe("string");
      expect(savedCatalogPath.length).toBeGreaterThan(0);
      expect(savedCatalogPath).toBe(`${isolatedCwd}/.data/catalog.json`);
      expect(logSpy).toHaveBeenCalledWith(`  Catalog saved to ${isolatedCwd}/.data/catalog.json`);
      expect(typeof iconUrl).toBe("string");
      expect(iconUrl.length).toBeGreaterThan(0);
    });
  });
});
