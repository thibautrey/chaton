import crypto from 'node:crypto'
import { getDb } from '../../db/index.js'
import { ackQueueMessage, claimQueueMessages, enqueueExtensionMessage, listQueueMessages, nackQueueMessage } from '../../db/repos/extension-queue.js'
import { hasCapability, trackCapability } from './capabilities.js'
import { unauthorized } from './helpers.js'
import type { ExtensionHostCallResult } from './types.js'
import { invalidArgs, isErrorResult, normalizeRuntimeExtensionId, normalizeRuntimeTopic } from './validation.js'

type ExtensionHostCallErrorResult = Extract<ExtensionHostCallResult, { ok: false }>

const MAX_CONSUMER_ID_LENGTH = 80
const MAX_MESSAGE_ID_LENGTH = 128
const MAX_IDEMPOTENCY_KEY_LENGTH = 160
const MAX_ERROR_MESSAGE_LENGTH = 2_000
const MAX_QUEUE_PAYLOAD_BYTES = 256 * 1024
const MAX_QUEUE_CONSUME_LIMIT = 100

function normalizeConsumerId(consumerId: string): string | ExtensionHostCallErrorResult {
  const value = String(consumerId ?? '').trim()
  if (!value) return invalidArgs('consumerId is required')
  if (value.length > MAX_CONSUMER_ID_LENGTH) return invalidArgs('consumerId too long')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)) {
    return invalidArgs('consumerId can only contain letters, numbers, dots, underscores, colons and hyphens')
  }
  return value
}

function normalizeMessageId(messageId: string): string | ExtensionHostCallErrorResult {
  const value = String(messageId ?? '').trim()
  if (!value) return invalidArgs('messageId is required')
  if (value.length > MAX_MESSAGE_ID_LENGTH) return invalidArgs('messageId too long')
  if (!/^[a-zA-Z0-9._:-]+$/.test(value)) {
    return invalidArgs('messageId can only contain letters, numbers, dots, underscores, colons and hyphens')
  }
  return value
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 32 || code === 127) return true
  }
  return false
}

function normalizeIdempotencyKey(value: unknown): string | undefined | ExtensionHostCallErrorResult {
  if (typeof value === 'undefined' || value === null) return undefined
  if (typeof value !== 'string') return invalidArgs('idempotencyKey must be a string')
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) return invalidArgs('idempotencyKey too long')
  if (hasControlCharacter(trimmed)) return invalidArgs('idempotencyKey cannot contain control characters')
  return trimmed
}

function normalizeIsoDate(value: unknown, field: string): string | undefined | ExtensionHostCallErrorResult {
  if (typeof value === 'undefined' || value === null) return undefined
  if (typeof value !== 'string') return invalidArgs(`${field} must be a string`)
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const timestamp = Date.parse(trimmed)
  if (!Number.isFinite(timestamp)) return invalidArgs(`${field} must be a valid ISO date`)
  return new Date(timestamp).toISOString()
}

function normalizeErrorMessage(value: unknown): string | undefined | ExtensionHostCallErrorResult {
  if (typeof value === 'undefined' || value === null) return undefined
  if (typeof value !== 'string') return invalidArgs('errorMessage must be a string')
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

function normalizeOptionalRecord(value: unknown, field: string): Record<string, unknown> | undefined | ExtensionHostCallErrorResult {
  if (typeof value === 'undefined' || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) return invalidArgs(`${field} must be an object`)
  return value as Record<string, unknown>
}

function normalizeConsumeLimit(value: unknown): number | undefined | ExtensionHostCallErrorResult {
  if (typeof value === 'undefined' || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalidArgs('limit must be a finite number')
  if (!Number.isInteger(value)) return invalidArgs('limit must be an integer')
  if (value < 1) return invalidArgs('limit must be at least 1')
  if (value > MAX_QUEUE_CONSUME_LIMIT) return invalidArgs(`limit must be at most ${MAX_QUEUE_CONSUME_LIMIT}`)
  return value
}

function validateQueuePayload(payload: unknown): ExtensionHostCallResult | null {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(payload)
  } catch {
    return invalidArgs('payload must be JSON serializable')
  }
  if (typeof serialized !== 'string') return invalidArgs('payload must be JSON serializable')
  if (Buffer.byteLength(serialized, 'utf8') > MAX_QUEUE_PAYLOAD_BYTES) return invalidArgs('payload too large')
  return null
}

function normalizeAutomationEventName(eventName: string): string | ExtensionHostCallErrorResult {
  const value = String(eventName ?? '').trim()
  if (!value) return invalidArgs('event name is required')
  if (value.length > 100) return invalidArgs('event name too long')
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    return invalidArgs('event name can only contain letters, numbers, underscores and hyphens')
  }
  return value
}


export function publishExtensionEvent(
  extensionId: string,
  topic: string,
  payload: unknown,
  meta?: { idempotencyKey?: string },
): ExtensionHostCallResult {
  const normalizedExtensionId = normalizeRuntimeExtensionId(extensionId)
  if (isErrorResult(normalizedExtensionId)) return normalizedExtensionId
  extensionId = normalizedExtensionId

  const normalizedTopic = normalizeRuntimeTopic(topic)
  if (isErrorResult(normalizedTopic)) return normalizedTopic
  topic = normalizedTopic

  const normalizedMeta = normalizeOptionalRecord(meta, 'meta')
  if (isErrorResult(normalizedMeta)) return normalizedMeta

  const idempotencyKey = normalizeIdempotencyKey(normalizedMeta?.idempotencyKey)
  if (isErrorResult(idempotencyKey)) return idempotencyKey

  const payloadError = validateQueuePayload(payload)
  if (payloadError) return payloadError

  if (!hasCapability(extensionId, 'events.publish')) {
    return unauthorized(`Extension ${extensionId} missing capability events.publish`)
  }
  trackCapability(extensionId, 'events.publish')

  const queueResult = enqueueExtensionMessage(getDb(), {
    id: crypto.randomUUID(),
    topic,
    payload,
    idempotencyKey,
  })

  return { ok: true, data: { messageId: queueResult.id, deduplicated: queueResult.deduplicated } }
}

export function publishExtensionAutomationEvent(
  extensionId: string,
  eventName: string,
  payload: unknown,
  meta?: { idempotencyKey?: string },
): ExtensionHostCallResult {
  const normalizedExtensionId = normalizeRuntimeExtensionId(extensionId)
  if (isErrorResult(normalizedExtensionId)) return normalizedExtensionId
  extensionId = normalizedExtensionId

  const normalizedMeta = normalizeOptionalRecord(meta, 'meta')
  if (isErrorResult(normalizedMeta)) return normalizedMeta

  const idempotencyKey = normalizeIdempotencyKey(normalizedMeta?.idempotencyKey)
  if (isErrorResult(idempotencyKey)) return idempotencyKey

  const normalizedEventName = normalizeAutomationEventName(eventName)
  if (isErrorResult(normalizedEventName)) return normalizedEventName
  eventName = normalizedEventName

  const payloadError = validateQueuePayload(payload)
  if (payloadError) return payloadError

  if (!hasCapability(extensionId, 'events.publish')) {
    return unauthorized(`Extension ${extensionId} missing capability events.publish`)
  }
  trackCapability(extensionId, 'events.publish')

  const fullTopic = `extension.${eventName}`
  const queueResult = enqueueExtensionMessage(getDb(), {
    id: crypto.randomUUID(),
    topic: fullTopic,
    payload,
    idempotencyKey,
  })

  return { ok: true, data: { messageId: queueResult.id, deduplicated: queueResult.deduplicated } }
}

export function queueEnqueue(
  extensionId: string,
  topic: string,
  payload: unknown,
  opts?: { idempotencyKey?: string; availableAt?: string },
): ExtensionHostCallResult {
  const normalizedExtensionId = normalizeRuntimeExtensionId(extensionId)
  if (isErrorResult(normalizedExtensionId)) return normalizedExtensionId
  extensionId = normalizedExtensionId

  const normalizedTopic = normalizeRuntimeTopic(topic)
  if (isErrorResult(normalizedTopic)) return normalizedTopic
  topic = normalizedTopic

  const normalizedOpts = normalizeOptionalRecord(opts, 'opts')
  if (isErrorResult(normalizedOpts)) return normalizedOpts

  const idempotencyKey = normalizeIdempotencyKey(normalizedOpts?.idempotencyKey)
  if (isErrorResult(idempotencyKey)) return idempotencyKey

  const availableAt = normalizeIsoDate(normalizedOpts?.availableAt, 'availableAt')
  if (isErrorResult(availableAt)) return availableAt

  const payloadError = validateQueuePayload(payload)
  if (payloadError) return payloadError

  if (!hasCapability(extensionId, 'queue.publish')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.publish`)
  }
  trackCapability(extensionId, 'queue.publish')

  const result = enqueueExtensionMessage(getDb(), {
    id: crypto.randomUUID(),
    topic,
    payload,
    idempotencyKey,
    availableAt,
  })

  return { ok: true, data: { id: result.id, deduplicated: result.deduplicated } }
}

export function queueConsume(
  extensionId: string,
  topic: string,
  consumerId: string,
  opts?: { limit?: number },
): ExtensionHostCallResult {
  const normalizedExtensionId = normalizeRuntimeExtensionId(extensionId)
  if (isErrorResult(normalizedExtensionId)) return normalizedExtensionId
  extensionId = normalizedExtensionId

  const normalizedTopic = normalizeRuntimeTopic(topic)
  if (isErrorResult(normalizedTopic)) return normalizedTopic
  topic = normalizedTopic

  const normalizedConsumerId = normalizeConsumerId(consumerId)
  if (isErrorResult(normalizedConsumerId)) return normalizedConsumerId
  consumerId = normalizedConsumerId

  const normalizedOpts = normalizeOptionalRecord(opts, 'opts')
  if (isErrorResult(normalizedOpts)) return normalizedOpts

  const limit = normalizeConsumeLimit(normalizedOpts?.limit)
  if (isErrorResult(limit)) return limit

  if (!hasCapability(extensionId, 'queue.consume')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.consume`)
  }
  trackCapability(extensionId, 'queue.consume')

  const claimed = claimQueueMessages(getDb(), { topic, consumerId, limit })
  return {
    ok: true,
    data: claimed.map((message) => {
      let payloadValue: unknown = null
      try {
        payloadValue = JSON.parse(message.payload_json)
      } catch {
        payloadValue = null
      }
      return {
        id: message.id,
        topic: message.topic,
        payload: payloadValue,
        attempts: message.attempts,
        createdAt: message.created_at,
      }
    }),
  }
}

export function queueAck(extensionId: string, messageId: string): ExtensionHostCallResult {
  const normalizedExtensionId = normalizeRuntimeExtensionId(extensionId)
  if (isErrorResult(normalizedExtensionId)) return normalizedExtensionId
  extensionId = normalizedExtensionId

  const normalizedMessageId = normalizeMessageId(messageId)
  if (isErrorResult(normalizedMessageId)) return normalizedMessageId
  messageId = normalizedMessageId

  if (!hasCapability(extensionId, 'queue.consume')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.consume`)
  }
  trackCapability(extensionId, 'queue.consume')
  const ok = ackQueueMessage(getDb(), messageId)
  return ok ? { ok: true } : { ok: false, error: { code: 'not_found', message: 'message not found' } }
}

export function queueNack(extensionId: string, messageId: string, retryAt?: string, errorMessage?: string): ExtensionHostCallResult {
  const normalizedExtensionId = normalizeRuntimeExtensionId(extensionId)
  if (isErrorResult(normalizedExtensionId)) return normalizedExtensionId
  extensionId = normalizedExtensionId

  const normalizedMessageId = normalizeMessageId(messageId)
  if (isErrorResult(normalizedMessageId)) return normalizedMessageId
  messageId = normalizedMessageId

  const normalizedRetryAt = normalizeIsoDate(retryAt, 'retryAt')
  if (isErrorResult(normalizedRetryAt)) return normalizedRetryAt

  const normalizedErrorMessage = normalizeErrorMessage(errorMessage)
  if (isErrorResult(normalizedErrorMessage)) return normalizedErrorMessage

  if (!hasCapability(extensionId, 'queue.consume')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.consume`)
  }
  trackCapability(extensionId, 'queue.consume')
  const result = nackQueueMessage(getDb(), { id: messageId, retryAt: normalizedRetryAt, error: normalizedErrorMessage })
  if (!result.ok) {
    return { ok: false, error: { code: 'not_found', message: 'message not found' } }
  }
  return { ok: true, data: { deadLettered: result.deadLettered } }
}

export function queueListDeadLetters(extensionId: string, topic?: string): ExtensionHostCallResult {
  const normalizedExtensionId = normalizeRuntimeExtensionId(extensionId)
  if (isErrorResult(normalizedExtensionId)) return normalizedExtensionId
  extensionId = normalizedExtensionId

  if (typeof topic !== 'undefined') {
    const normalizedTopic = normalizeRuntimeTopic(topic)
    if (isErrorResult(normalizedTopic)) return normalizedTopic
    topic = normalizedTopic
  }

  if (!hasCapability(extensionId, 'queue.consume')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.consume`)
  }
  trackCapability(extensionId, 'queue.consume')
  const rows = listQueueMessages(getDb(), { topic, status: 'dead', limit: 200 })
  return {
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      attempts: row.attempts,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  }
}
