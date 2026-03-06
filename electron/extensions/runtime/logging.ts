import fs from 'node:fs'
import { CHATON_BASE, EXTENSIONS_DIR, FILES_ROOT, LOGS_DIR } from './constants.js'

export function ensureDirs() {
  fs.mkdirSync(CHATON_BASE, { recursive: true })
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true })
  fs.mkdirSync(LOGS_DIR, { recursive: true })
  fs.mkdirSync(FILES_ROOT, { recursive: true })
}

export function extensionLogFileSafeId(extensionId: string) {
  return String(extensionId || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function appendExtensionLog(extensionId: string, level: 'info' | 'warn' | 'error', event: string, context?: unknown) {
  ensureDirs()
  const logPath = `${LOGS_DIR}/${extensionLogFileSafeId(extensionId)}.runtime.log`
  const line = JSON.stringify({ timestamp: new Date().toISOString(), extensionId, level, event, context: context ?? null })
  fs.appendFileSync(logPath, `${line}\n`, 'utf8')
}
