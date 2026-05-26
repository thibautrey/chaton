import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { findChatonPackageVersion, getCurrentAppVersion, resolveCurrentAppVersion } from './app-version.js'

describe('resolveCurrentAppVersion', () => {
  it('uses the Electron app version when it is not the Electron runtime version', () => {
    expect(resolveCurrentAppVersion({
      appVersion: '0.239.0',
      electronVersion: '41.0.3',
      packageVersion: '0.238.0',
    })).toBe('0.239.0')
  })

  it('uses package.json when Electron reports its own runtime version in development', () => {
    expect(resolveCurrentAppVersion({
      appVersion: '41.0.3',
      electronVersion: '41.0.3',
      packageVersion: '0.239.0',
    })).toBe('0.239.0')
  })

  it('falls back to the app version before the hardcoded default', () => {
    expect(resolveCurrentAppVersion({
      appVersion: '41.0.3',
      electronVersion: null,
      packageVersion: null,
    })).toBe('41.0.3')
  })
})

describe('findChatonPackageVersion', () => {
  it('walks up from a nested Electron module directory to the Chaton package file', () => {
    const root = mkdtempSync(join(tmpdir(), 'chaton-app-version-'))

    try {
      const nested = join(root, 'dist-electron', 'electron', 'lib', 'update')
      mkdirSync(nested, { recursive: true })
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'chaton', version: '0.239.0' }))

      expect(findChatonPackageVersion([nested])).toBe('0.239.0')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('getCurrentAppVersion', () => {
  it('resolves the package version from appPath when the Electron app version is the runtime version', () => {
    const root = mkdtempSync(join(tmpdir(), 'chaton-app-version-'))

    try {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'chaton', version: '0.240.0' }))

      expect(getCurrentAppVersion({
        appVersion: '41.0.3',
        electronVersion: '41.0.3',
        appPath: root,
      })).toBe('0.240.0')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
