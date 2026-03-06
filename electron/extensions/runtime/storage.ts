import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../../db/index.js'
import { extensionKvDelete, extensionKvGet, extensionKvList, extensionKvSet } from '../../db/repos/extension-kv.js'
import { FILES_ROOT } from './constants.js'
import { hasCapability, trackCapability } from './capabilities.js'
import { unauthorized } from './helpers.js'
import type { ExtensionHostCallResult } from './types.js'

function getFilesDirForExtension(extensionId: string): string {
  const dir = path.join(FILES_ROOT, extensionId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function sanitizeRelativePath(input: string): string | null {
  if (!input || input.includes('\0')) return null
  const normalized = path.normalize(input).replace(/^([/\\])+/, '')
  if (normalized.includes('..')) return null
  return normalized
}

export function storageKvGet(extensionId: string, key: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.kv')) return unauthorized(`Extension ${extensionId} missing capability storage.kv`)
  trackCapability(extensionId, 'storage.kv')
  return { ok: true, data: extensionKvGet(getDb(), extensionId, key) }
}

export function storageKvSet(extensionId: string, key: string, value: unknown): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.kv')) return unauthorized(`Extension ${extensionId} missing capability storage.kv`)
  trackCapability(extensionId, 'storage.kv')
  extensionKvSet(getDb(), extensionId, key, value)
  return { ok: true }
}

export function storageKvDeleteEntry(extensionId: string, key: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.kv')) return unauthorized(`Extension ${extensionId} missing capability storage.kv`)
  trackCapability(extensionId, 'storage.kv')
  const removed = extensionKvDelete(getDb(), extensionId, key)
  return { ok: true, data: { removed } }
}

export function storageKvListEntries(extensionId: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.kv')) return unauthorized(`Extension ${extensionId} missing capability storage.kv`)
  trackCapability(extensionId, 'storage.kv')
  return { ok: true, data: extensionKvList(getDb(), extensionId) }
}

export function storageFilesRead(extensionId: string, relativePath: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.files')) return unauthorized(`Extension ${extensionId} missing capability storage.files`)
  trackCapability(extensionId, 'storage.files')
  const safe = sanitizeRelativePath(relativePath)
  if (!safe) return { ok: false, error: { code: 'invalid_args', message: 'invalid path' } }
  const target = path.join(getFilesDirForExtension(extensionId), safe)
  if (!fs.existsSync(target)) return { ok: false, error: { code: 'not_found', message: 'file not found' } }
  return { ok: true, data: fs.readFileSync(target, 'utf8') }
}

export function storageFilesWrite(extensionId: string, relativePath: string, content: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.files')) return unauthorized(`Extension ${extensionId} missing capability storage.files`)
  trackCapability(extensionId, 'storage.files')
  const safe = sanitizeRelativePath(relativePath)
  if (!safe) return { ok: false, error: { code: 'invalid_args', message: 'invalid path' } }
  const root = getFilesDirForExtension(extensionId)
  const target = path.join(root, safe)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
  return { ok: true }
}
