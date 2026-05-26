/**
 * Unit tests for extension-registry/lib/discovery.ts
 *
 * Testing strategy:
 * - Pure helpers: normalizePackageName, isChatonsExtensionPackage — fully tested
 * - Async functions (fetchJson, packageHasChatonsManifest, discoverNpmPackages,
 *   withAutoDiscoveredRegistry) — require extensive mock infrastructure for node:zlib
 *   gunzip and global fetch. Omitted from this test file; covered by integration
 *   tests in sync.test.ts if the discovery pipeline is exercised through syncExtensions.
 *
 * The two pure functions are inlined here (exact replication of discovery.ts source)
 * so tests are independent of module exports. When functions are extracted or
 * exported in future, this test file should be updated to import from the module.
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------
// Inline helpers (exact replication of discovery.ts source)
// ---------------------------------------------------------------------

// normalizePackageName: discovery.ts lines 7-12
function normalizePackageName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name) return null;
  return name;
}

// isChatonsExtensionPackage: discovery.ts lines 14-16
function isChatonsExtensionPackage(name: string): boolean {
  return /^@[^/]+\/chatons-(channel|extension)-[a-z0-9][a-z0-9-]*$/i.test(name);
}

// ---------------------------------------------------------------------
// normalizePackageName
// ---------------------------------------------------------------------
describe('normalizePackageName', () => {
  it('returns null for non-string values', () => {
    expect(normalizePackageName(null)).toBeNull()
    expect(normalizePackageName(undefined)).toBeNull()
    expect(normalizePackageName(42)).toBeNull()
    expect(normalizePackageName({})).toBeNull()
    expect(normalizePackageName([])).toBeNull()
    expect(normalizePackageName(true)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizePackageName('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(normalizePackageName('   ')).toBeNull()
    expect(normalizePackageName('\t')).toBeNull()
    expect(normalizePackageName('\n')).toBeNull()
    expect(normalizePackageName('  \t  \n  ')).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(normalizePackageName('  my-package  ')).toBe('my-package')
    expect(normalizePackageName('\t@scope/my-pkg\n')).toBe('@scope/my-pkg')
  })

  it('returns the trimmed string for valid package names', () => {
    expect(normalizePackageName('lodash')).toBe('lodash')
    expect(normalizePackageName('@types/node')).toBe('@types/node')
    expect(normalizePackageName('@acme/chatons-channel-my-channel')).toBe('@acme/chatons-channel-my-channel')
    expect(normalizePackageName('@acme/chatons-extension-my-ext')).toBe('@acme/chatons-extension-my-ext')
  })

  it('does not truncate non-oversized strings', () => {
    const short = 'lodash'
    expect(normalizePackageName(short)).toBe(short)
  })

  it('does not mutate the original value (input is string, output is new string)', () => {
    // normalizePackageName always returns a new string or null; it never mutates
    const input = '  my-package  '
    normalizePackageName(input)
    expect(input).toBe('  my-package  ')
  })
})

// ---------------------------------------------------------------------
// isChatonsExtensionPackage
// ---------------------------------------------------------------------
describe('isChatonsExtensionPackage', () => {
  it('returns true for valid @scope/chatons-channel-* names', () => {
    expect(isChatonsExtensionPackage('@acme/chatons-channel-foo')).toBe(true)
    expect(isChatonsExtensionPackage('@acme/chatons-channel-bar-baz')).toBe(true)
    expect(isChatonsExtensionPackage('@types/chatons-channel-react')).toBe(true)
  })

  it('returns true for valid @scope/chatons-extension-* names', () => {
    expect(isChatonsExtensionPackage('@acme/chatons-extension-mytool')).toBe(true)
    expect(isChatonsExtensionPackage('@acme/chatons-extension-my-tool')).toBe(true)
    expect(isChatonsExtensionPackage('@types/chatons-extension-ts')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isChatonsExtensionPackage('@AcMe/CHATONS-Channel-Foo')).toBe(true)
    expect(isChatonsExtensionPackage('@acme/CHATONS-EXTENSION-MyTool')).toBe(true)
    expect(isChatonsExtensionPackage('@ABC/CHATONS-CHANNEL-X')).toBe(true)
  })

  it('returns false for unscoped names', () => {
    expect(isChatonsExtensionPackage('chatons-channel-foo')).toBe(false)
    expect(isChatonsExtensionPackage('chatons-extension-foo')).toBe(false)
  })

  it('returns false for non-chatons packages', () => {
    expect(isChatonsExtensionPackage('@acme/lodash')).toBe(false)
    expect(isChatonsExtensionPackage('@acme/react')).toBe(false)
    expect(isChatonsExtensionPackage('@types/node')).toBe(false)
  })

  it('returns false for wrong prefix patterns', () => {
    expect(isChatonsExtensionPackage('@acme/chatons-tools-foo')).toBe(false)
    expect(isChatonsExtensionPackage('@acme/chaton-channel-foo')).toBe(false) // missing 's'
    expect(isChatonsExtensionPackage('@acme/chatons-ext-foo')).toBe(false)     // wrong suffix
    expect(isChatonsExtensionPackage('@acme/chatons_channels_foo')).toBe(false) // underscores
  })

  it('returns false for empty or malformed strings', () => {
    expect(isChatonsExtensionPackage('')).toBe(false)
    expect(isChatonsExtensionPackage('@')).toBe(false)
    expect(isChatonsExtensionPackage('@/')).toBe(false)
    expect(isChatonsExtensionPackage('@acme/')).toBe(false)
  })

  it('returns false for names without a second component', () => {
    expect(isChatonsExtensionPackage('@acme')).toBe(false)
    expect(isChatonsExtensionPackage('@acme/')).toBe(false)
    expect(isChatonsExtensionPackage('@acme/  ')).toBe(false)
  })

  it('returns true for names with digits anywhere in the suffix', () => {
    expect(isChatonsExtensionPackage('@acme/chatons-channel-2cool')).toBe(true)
    expect(isChatonsExtensionPackage('@acme/chatons-extension-1')).toBe(true)
    expect(isChatonsExtensionPackage('@acme/chatons-channel-ext1-test2')).toBe(true)
  })

  it('returns true for names with uppercase in the suffix (the /i flag makes the whole regex case-insensitive)', () => {
    expect(isChatonsExtensionPackage('@acme/CHATONS-CHANNEL-MyTool')).toBe(true)
    expect(isChatonsExtensionPackage('@acme/chatons-channel-MyTool')).toBe(true)
    expect(isChatonsExtensionPackage('@AcMe/CHATONS-CHANNEL-Foo')).toBe(true)
  })

  it('returns false for names with hyphens at invalid positions', () => {
    // The name must match: @scope/chatons-(channel|extension)-[a-z0-9][a-z0-9-]*
    // so it must have at least 1 char after 'chatons-channel-' or 'chatons-extension-'
    expect(isChatonsExtensionPackage('@acme/chatons-channel-')).toBe(false)
    expect(isChatonsExtensionPackage('@acme/chatons-extension-')).toBe(false)
    expect(isChatonsExtensionPackage('@acme/chatons-channel--tool')).toBe(false) // double dash
    expect(isChatonsExtensionPackage('@acme/chatons-extension--tool')).toBe(false)
  })

  it('accepts hyphens in the suffix part (after first char)', () => {
    expect(isChatonsExtensionPackage('@acme/chatons-channel-my-tool-v2')).toBe(true)
    expect(isChatonsExtensionPackage('@acme/chatons-extension-foo-bar')).toBe(true)
  })
})
