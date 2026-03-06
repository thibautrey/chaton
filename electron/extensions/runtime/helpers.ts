import { Type } from '@sinclair/typebox'
import type { ExtensionHostCallResult } from './types.js'

export function unauthorized(message: string): ExtensionHostCallResult {
  return { ok: false, error: { code: 'unauthorized', message } }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function normalizeTypeBoxSchema(value: unknown) {
  const record = asRecord(value)
  if (!record) return Type.Object({})
  return record as ReturnType<typeof Type.Object>
}

export function safeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function parseTriggerDescription(input: string) {
  const text = String(input || '').trim().toLowerCase()
  if (text.includes('message')) return 'conversation.message.received'
  if (text.includes('projet') || text.includes('project')) return 'project.created'
  if (text.includes('fin') || text.includes('termine') || text.includes('ended')) return 'conversation.agent.ended'
  return 'conversation.created'
}

export function parseCooldownToMs(input: string) {
  const text = String(input || '').trim().toLowerCase()
  let match = text.match(/(\d+)\s*(ms|millisecond|milliseconds)/)
  if (match) return Math.max(0, Number(match[1]) || 0)
  match = text.match(/(\d+)\s*(s|sec|secs|second|seconds)/)
  if (match) return (Number(match[1]) || 0) * 1000
  match = text.match(/(\d+)\s*(min|minute|minutes)/)
  if (match) return (Number(match[1]) || 0) * 60_000
  match = text.match(/(\d+)\s*(h|heure|heures|hour|hours)/)
  if (match) return (Number(match[1]) || 0) * 3_600_000
  return 0
}

export function sanitizePiToolName(input: string) {
  return String(input || '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}
