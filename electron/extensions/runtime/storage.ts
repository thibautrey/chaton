import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../../db/index.js'
import { extensionKvDelete, extensionKvGet, extensionKvList, extensionKvSet } from '../../db/repos/extension-kv.js'
import { FILES_ROOT } from './constants.js'
import { hasCapability, trackCapability } from './capabilities.js'
import { normalizeExtensionId } from './extension-id.js'
import { unauthorized } from './helpers.js'
import { isPathInsideRoot } from './path-safety.js'
import { invalidArgs } from './validation.js'
import type { ExtensionHostCallResult } from './types.js'

const MAX_KV_KEY_LENGTH = 200
const MAX_KV_VALUE_BYTES = 256 * 1024
const MAX_FILE_CONTENT_BYTES = 5 * 1024 * 1024

function normalizeStorageExtensionId(extensionId: string): string | null {
  return normalizeExtensionId(extensionId)
}

function getFilesDirForExtension(extensionId: string): string | null {
  const safeExtensionId = normalizeStorageExtensionId(extensionId)
  if (!safeExtensionId) return null
  const dir = path.join(FILES_ROOT, safeExtensionId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function sanitizeRelativePath(input: string): string | null {
  if (!input || input.includes('\0')) return null
  const normalized = path.normalize(input).replace(/^([/\\])+/, '')
  if (normalized.includes('..')) return null
  return normalized
}

function invalidPath(): ExtensionHostCallResult {
  return invalidArgs('invalid path')
}

function validateFileContent(content: unknown): ExtensionHostCallResult | null {
  if (typeof content !== 'string') return invalidArgs('content must be a string')
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_CONTENT_BYTES) return invalidArgs('content too large')
  return null
}

function validateResolvedFileTarget(root: string, target: string, options?: { allowMissing?: boolean; checkSize?: boolean }): ExtensionHostCallResult | null {
  if (!isPathInsideRoot(root, target)) return invalidPath()
  if (!fs.existsSync(target)) {
    const ancestorError = validateExistingDirectoryAncestors(root, path.dirname(target))
    if (ancestorError) return ancestorError
    return options?.allowMissing ? null : { ok: false, error: { code: 'not_found', message: 'file not found' } }
  }
  const stat = fs.lstatSync(target)
  if (stat.isSymbolicLink()) return invalidPath()
  if (!stat.isFile()) return invalidPath()
  if (options?.checkSize !== false && stat.size > MAX_FILE_CONTENT_BYTES) return invalidArgs('file too large')
  const realRoot = fs.realpathSync(root)
  const realTarget = fs.realpathSync(target)
  if (!isPathInsideRoot(realRoot, realTarget)) return invalidPath()
  return null
}

function validateExistingDirectoryAncestors(root: string, dir: string): ExtensionHostCallResult | null {
  if (!isPathInsideRoot(root, dir)) return invalidPath()
  const realRoot = fs.realpathSync(root)
  const relativeDir = path.relative(root, dir)
  const segments = relativeDir && relativeDir !== '.' ? relativeDir.split(path.sep).filter(Boolean) : []
  let current = root
  for (const segment of segments) {
    current = path.join(current, segment)
    if (!fs.existsSync(current)) return null
    const stat = fs.lstatSync(current)
    if (stat.isSymbolicLink() || !stat.isDirectory()) return invalidPath()
    const realCurrent = fs.realpathSync(current)
    if (!isPathInsideRoot(realRoot, realCurrent)) return invalidPath()
  }
  return null
}

function validateResolvedDirectory(root: string, dir: string): ExtensionHostCallResult | null {
  if (!isPathInsideRoot(root, dir)) return invalidPath()
  const realRoot = fs.realpathSync(root)
  const relativeDir = path.relative(root, dir)
  const segments = relativeDir && relativeDir !== '.' ? relativeDir.split(path.sep).filter(Boolean) : []
  let current = root
  for (const segment of segments) {
    current = path.join(current, segment)
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current)
      if (stat.isSymbolicLink() || !stat.isDirectory()) return invalidPath()
      const realCurrent = fs.realpathSync(current)
      if (!isPathInsideRoot(realRoot, realCurrent)) return invalidPath()
      continue
    }
    fs.mkdirSync(current)
  }
  return null
}

function normalizeKvKey(key: string): string | ExtensionHostCallResult {
  const value = String(key ?? '').trim()
  if (!value) return invalidArgs('key is required')
  if (value.length > MAX_KV_KEY_LENGTH) return invalidArgs('key too long')
  if (/[\0\x00-\x1F\x7F]/.test(value)) return invalidArgs('key contains unsupported characters')
  return value
}

function validateKvValue(value: unknown): ExtensionHostCallResult | null {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch {
    return invalidArgs('value must be JSON serializable')
  }
  if (typeof serialized !== 'string') return invalidArgs('value must be JSON serializable')
  if (Buffer.byteLength(serialized, 'utf8') > MAX_KV_VALUE_BYTES) return invalidArgs('value too large')
  return null
}

export function storageKvGet(extensionId: string, key: string): ExtensionHostCallResult {
  const safeExtensionId = normalizeStorageExtensionId(extensionId)
  if (!safeExtensionId) return invalidArgs('invalid extension id')
  const safeKey = normalizeKvKey(key)
  if (typeof safeKey !== 'string') return safeKey
  if (!hasCapability(safeExtensionId, 'storage.kv')) return unauthorized(`Extension ${safeExtensionId} missing capability storage.kv`)
  trackCapability(safeExtensionId, 'storage.kv')
  return { ok: true, data: extensionKvGet(getDb(), safeExtensionId, safeKey) }
}

export function storageKvSet(extensionId: string, key: string, value: unknown): ExtensionHostCallResult {
  const safeExtensionId = normalizeStorageExtensionId(extensionId)
  if (!safeExtensionId) return invalidArgs('invalid extension id')
  const safeKey = normalizeKvKey(key)
  if (typeof safeKey !== 'string') return safeKey
  const valueError = validateKvValue(value)
  if (valueError) return valueError
  if (!hasCapability(safeExtensionId, 'storage.kv')) return unauthorized(`Extension ${safeExtensionId} missing capability storage.kv`)
  trackCapability(safeExtensionId, 'storage.kv')
  extensionKvSet(getDb(), safeExtensionId, safeKey, value)
  return { ok: true }
}

export function storageKvDeleteEntry(extensionId: string, key: string): ExtensionHostCallResult {
  const safeExtensionId = normalizeStorageExtensionId(extensionId)
  if (!safeExtensionId) return invalidArgs('invalid extension id')
  const safeKey = normalizeKvKey(key)
  if (typeof safeKey !== 'string') return safeKey
  if (!hasCapability(safeExtensionId, 'storage.kv')) return unauthorized(`Extension ${safeExtensionId} missing capability storage.kv`)
  trackCapability(safeExtensionId, 'storage.kv')
  const removed = extensionKvDelete(getDb(), safeExtensionId, safeKey)
  return { ok: true, data: { removed } }
}

export function storageKvListEntries(extensionId: string): ExtensionHostCallResult {
  const safeExtensionId = normalizeStorageExtensionId(extensionId)
  if (!safeExtensionId) return invalidArgs('invalid extension id')
  if (!hasCapability(safeExtensionId, 'storage.kv')) return unauthorized(`Extension ${safeExtensionId} missing capability storage.kv`)
  trackCapability(safeExtensionId, 'storage.kv')
  return { ok: true, data: extensionKvList(getDb(), safeExtensionId) }
}

export function storageFilesRead(extensionId: string, relativePath: string): ExtensionHostCallResult {
  const safeExtensionId = normalizeStorageExtensionId(extensionId)
  if (!safeExtensionId) return { ok: false, error: { code: 'invalid_args', message: 'invalid extension id' } }
  if (!hasCapability(safeExtensionId, 'storage.files')) return unauthorized(`Extension ${safeExtensionId} missing capability storage.files`)
  trackCapability(safeExtensionId, 'storage.files')
  const safe = sanitizeRelativePath(relativePath)
  if (!safe) return { ok: false, error: { code: 'invalid_args', message: 'invalid path' } }
  const root = getFilesDirForExtension(safeExtensionId)
  if (!root) return { ok: false, error: { code: 'invalid_args', message: 'invalid extension id' } }
  const target = path.join(root, safe)
  const targetError = validateResolvedFileTarget(root, target)
  if (targetError) return targetError
  return { ok: true, data: fs.readFileSync(target, 'utf8') }
}

export function storageFilesWrite(extensionId: string, relativePath: string, content: string): ExtensionHostCallResult {
  const safeExtensionId = normalizeStorageExtensionId(extensionId)
  if (!safeExtensionId) return { ok: false, error: { code: 'invalid_args', message: 'invalid extension id' } }
  const contentError = validateFileContent(content)
  if (contentError) return contentError
  if (!hasCapability(safeExtensionId, 'storage.files')) return unauthorized(`Extension ${safeExtensionId} missing capability storage.files`)
  trackCapability(safeExtensionId, 'storage.files')
  const safe = sanitizeRelativePath(relativePath)
  if (!safe) return { ok: false, error: { code: 'invalid_args', message: 'invalid path' } }
  const root = getFilesDirForExtension(safeExtensionId)
  if (!root) return { ok: false, error: { code: 'invalid_args', message: 'invalid extension id' } }
  const target = path.join(root, safe)
  const dirError = validateResolvedDirectory(root, path.dirname(target))
  if (dirError) return dirError
  if (fs.existsSync(target)) {
    const targetError = validateResolvedFileTarget(root, target, { allowMissing: true, checkSize: false })
    if (targetError) return targetError
  }
  fs.writeFileSync(target, content, 'utf8')
  return { ok: true }
}
