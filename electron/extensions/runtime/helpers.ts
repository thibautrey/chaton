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
  if (text.includes('cron') || text.includes('schedule') || text.includes('every') || text.includes('am') || text.includes('pm') || text.includes('heure') || text.includes('h')) return 'cron'
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

/**
 * Parse a model key like "provider/modelId" into its two parts.
 * Splits on the first slash only so model IDs that contain slashes
 * (e.g. "litellm/mistral/devstral-medium-latest") are preserved intact.
 * Returns null if the key doesn't contain a slash.
 */
export function parseModelKey(modelKey: string): { provider: string; modelId: string } | null {
  const idx = modelKey.indexOf('/')
  if (idx < 0) return null
  const provider = modelKey.slice(0, idx)
  const modelId = modelKey.slice(idx + 1)
  if (!provider || !modelId) return null
  return { provider, modelId }
}

const THINKING_BLOCK_PATTERNS = [
  /<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi,
  /<think\b[^>]*>[\s\S]*?<\/think>/gi,
]

export function stripThinkingBlocks(text: string): string {
  if (!text) return text

  let result = text
  for (const pattern of THINKING_BLOCK_PATTERNS) {
    result = result.replace(pattern, '')
  }

  return result
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
    .trim()
}

/**
 * Parse natural language cron patterns and convert them to standard cron expressions.
 * Examples:
 *   "every day at 9am" -> "0 9 * * *"
 *   "every 5 minutes" -> "* /5 * * * *"
 *   "every monday at 2pm" -> "0 14 * * 1"
 *   "0 9 * * *" -> "0 9 * * *" (returns as-is if already valid)
 */
export function parseCronExpression(input: string): string | null {
  const text = input.trim().toLowerCase()
  
  // If it looks like a cron expression already (5 fields with numbers/asterisks/commas/dashes/slashes)
  const cronPattern = /^(\d+|\*|[*/\d,-]+)\s+(\d+|\*|[*/\d,-]+)\s+(\d+|\*|[*/\d,-]+)\s+(\d+|\*|[*/\d,-]+)\s+(\d+|\*|[*/\d,-]+)$/
  if (cronPattern.test(text)) {
    return text
  }

  // Natural language patterns
  
  // "every day at 9am/9:00"
  let match = text.match(/every\s+day\s+at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/i)
  if (match) {
    let hour = parseInt(match[1], 10)
    const mins = match[2] ? parseInt(match[2], 10) : 0
    if (match[3]?.toLowerCase() === 'pm' && hour !== 12) hour += 12
    if (match[3]?.toLowerCase() === 'am' && hour === 12) hour = 0
    return `${mins} ${hour} * * *`
  }

  // "every N minutes"
  match = text.match(/every\s+(\d+)\s+minutes?/)
  if (match) {
    const n = parseInt(match[1], 10)
    return `*/${n} * * * *`
  }

  // "every N hours"
  match = text.match(/every\s+(\d+)\s+hours?/)
  if (match) {
    const n = parseInt(match[1], 10)
    return `0 */${n} * * *`
  }

  // "every N days"
  match = text.match(/every\s+(\d+)\s+days?/)
  if (match) {
    const n = parseInt(match[1], 10)
    return `0 0 */${n} * *`
  }

  // "every monday/tuesday/etc at 2pm"
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayNames = daysOfWeek.join('|')
  match = text.match(new RegExp(`every\\s+(${dayNames})\\s+at\\s+(\\d{1,2}):?(\\d{2})?\\s*(am|pm)?`, 'i'))
  if (match) {
    const dayName = match[1].toLowerCase()
    const dayNum = daysOfWeek.indexOf(dayName)
    let hour = parseInt(match[2], 10)
    const mins = match[3] ? parseInt(match[3], 10) : 0
    if (match[4]?.toLowerCase() === 'pm' && hour !== 12) hour += 12
    if (match[4]?.toLowerCase() === 'am' && hour === 12) hour = 0
    return `${mins} ${hour} * * ${dayNum}`
  }

  // "every N days at HH:MM"
  match = text.match(/every\s+(\d+)\s+days?\s+at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/)
  if (match) {
    const n = parseInt(match[1], 10)
    let hour = parseInt(match[2], 10)
    const mins = match[3] ? parseInt(match[3], 10) : 0
    if (match[4]?.toLowerCase() === 'pm' && hour !== 12) hour += 12
    if (match[4]?.toLowerCase() === 'am' && hour === 12) hour = 0
    return `${mins} ${hour} */${n} * *`
  }

  // Common French patterns
  // "chaque jour à 9h" or "tous les jours à 9h"
  match = text.match(/(?:chaque|tous les)\s+jours?\s+à\s+(\d{1,2}):?(\d{2})?\s*(h)?/i)
  if (match) {
    const hour = parseInt(match[1], 10)
    const mins = match[2] ? parseInt(match[2], 10) : 0
    return `${mins} ${hour} * * *`
  }

  // "toutes les N minutes"
  match = text.match(/toutes?\s+les\s+(\d+)\s+minutes?/)
  if (match) {
    const n = parseInt(match[1], 10)
    return `*/${n} * * * *`
  }

  return null
}

/**
 * Validate a cron expression (basic validation)
 */
export function isValidCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return false
  
  const ranges = [
    { min: 0, max: 59 }, // minute
    { min: 0, max: 23 }, // hour
    { min: 1, max: 31 }, // day of month
    { min: 1, max: 12 }, // month
    { min: 0, max: 6 },  // day of week
  ]

  for (let i = 0; i < 5; i++) {
    const field = fields[i]
    if (!validateCronField(field, ranges[i].min, ranges[i].max)) {
      return false
    }
  }
  return true
}

function validateCronField(field: string, min: number, max: number): boolean {
  if (field === '*') return true
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10)
    return !isNaN(step) && step > 0
  }
  // Check comma first to avoid dash-splitting a field that contains both commas and dashes
  // (e.g. "1-3,5" would split incorrectly: ['1', '3,5'] — parseInt('3,5') = 3, falsely passing).
  if (field.includes(',')) {
    return field.split(',').every((f) => validateCronField(f, min, max))
  }
  if (field.includes('-')) {
    const [start, end] = field.split('-')
    const s = parseInt(start, 10)
    const e = parseInt(end, 10)
    return !isNaN(s) && !isNaN(e) && s >= min && e <= max && s <= e
  }
  const num = parseInt(field, 10)
  return !isNaN(num) && num >= min && num <= max
}
