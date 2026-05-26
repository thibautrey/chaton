import { existsSync, readFileSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const FALLBACK_APP_VERSION = '0.1.0'

interface ResolveCurrentAppVersionInput {
  appVersion?: string | null
  electronVersion?: string | null
  packageVersion?: string | null
  fallbackVersion?: string
}

interface GetCurrentAppVersionInput {
  appVersion?: string | null
  electronVersion?: string | null
  appPath?: string | null
  packageVersion?: string | null
  fallbackVersion?: string
}

function normalizeVersion(version: string | null | undefined): string | null {
  const normalized = typeof version === 'string' ? version.trim().replace(/^v/i, '') : ''
  return normalized.length > 0 ? normalized : null
}

export function resolveCurrentAppVersion({
  appVersion,
  electronVersion = process.versions.electron,
  packageVersion,
  fallbackVersion = FALLBACK_APP_VERSION,
}: ResolveCurrentAppVersionInput): string {
  const normalizedAppVersion = normalizeVersion(appVersion)
  const normalizedElectronVersion = normalizeVersion(electronVersion)
  const normalizedPackageVersion = normalizeVersion(packageVersion)

  if (normalizedAppVersion && normalizedAppVersion !== normalizedElectronVersion) {
    return normalizedAppVersion
  }

  if (normalizedPackageVersion) {
    return normalizedPackageVersion
  }

  return normalizedAppVersion ?? fallbackVersion
}

function readPackageVersion(packageJsonPath: string): string | null {
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { name?: unknown; version?: unknown }
    if (packageJson.name !== 'chaton' || typeof packageJson.version !== 'string') {
      return null
    }

    return normalizeVersion(packageJson.version)
  } catch {
    return null
  }
}

export function findChatonPackageVersion(startPaths: Array<string | null | undefined>): string | null {
  const visited = new Set<string>()

  for (const startPath of startPaths) {
    if (!startPath) {
      continue
    }

    let currentDir = resolve(startPath)
    if (existsSync(currentDir) && !statSync(currentDir).isDirectory() && !currentDir.endsWith('.asar')) {
      currentDir = dirname(currentDir)
    }

    while (!visited.has(currentDir)) {
      visited.add(currentDir)

      const version = readPackageVersion(join(currentDir, 'package.json'))
      if (version) {
        return version
      }

      const parent = dirname(currentDir)
      if (parent === currentDir) {
        break
      }
      currentDir = parent
    }
  }

  return null
}

export function getCurrentAppVersion({
  appVersion,
  electronVersion = process.versions.electron,
  appPath,
  packageVersion,
  fallbackVersion = FALLBACK_APP_VERSION,
}: GetCurrentAppVersionInput): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const resolvedPackageVersion = packageVersion ?? findChatonPackageVersion([
    appPath,
    process.cwd(),
    moduleDir,
  ])

  return resolveCurrentAppVersion({
    appVersion,
    electronVersion,
    packageVersion: resolvedPackageVersion,
    fallbackVersion,
  })
}
