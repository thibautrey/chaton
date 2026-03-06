import crypto from 'node:crypto'
import { getDb } from '../../db/index.js'
import { ackQueueMessage, claimQueueMessages, enqueueExtensionMessage, listQueueMessages, nackQueueMessage } from '../../db/repos/extension-queue.js'
import { hasCapability, trackCapability } from './capabilities.js'
import { unauthorized } from './helpers.js'
import type { ExtensionHostCallResult } from './types.js'

export function publishExtensionEvent(
  extensionId: string,
  topic: string,
  payload: unknown,
  meta?: { idempotencyKey?: string },
): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'events.publish')) {
    return unauthorized(`Extension ${extensionId} missing capability events.publish`)
  }
  trackCapability(extensionId, 'events.publish')

  if (topic.length > 120) {
    return { ok: false, error: { code: 'invalid_args', message: 'topic too long' } }
  }

  const queueResult = enqueueExtensionMessage(getDb(), {
    id: crypto.randomUUID(),
    topic,
    payload,
    idempotencyKey: meta?.idempotencyKey,
  })

  return { ok: true, data: { messageId: queueResult.id, deduplicated: queueResult.deduplicated } }
}

export function queueEnqueue(
  extensionId: string,
  topic: string,
  payload: unknown,
  opts?: { idempotencyKey?: string; availableAt?: string },
): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'queue.publish')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.publish`)
  }
  trackCapability(extensionId, 'queue.publish')

  const result = enqueueExtensionMessage(getDb(), {
    id: crypto.randomUUID(),
    topic,
    payload,
    idempotencyKey: opts?.idempotencyKey,
    availableAt: opts?.availableAt,
  })

  return { ok: true, data: { id: result.id, deduplicated: result.deduplicated } }
}

export function queueConsume(
  extensionId: string,
  topic: string,
  consumerId: string,
  opts?: { limit?: number },
): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'queue.consume')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.consume`)
  }
  trackCapability(extensionId, 'queue.consume')

  const claimed = claimQueueMessages(getDb(), { topic, consumerId, limit: opts?.limit })
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
  if (!hasCapability(extensionId, 'queue.consume')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.consume`)
  }
  trackCapability(extensionId, 'queue.consume')
  const ok = ackQueueMessage(getDb(), messageId)
  return ok ? { ok: true } : { ok: false, error: { code: 'not_found', message: 'message not found' } }
}

export function queueNack(extensionId: string, messageId: string, retryAt?: string, errorMessage?: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'queue.consume')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.consume`)
  }
  trackCapability(extensionId, 'queue.consume')
  const result = nackQueueMessage(getDb(), { id: messageId, retryAt, error: errorMessage })
  if (!result.ok) {
    return { ok: false, error: { code: 'not_found', message: 'message not found' } }
  }
  return { ok: true, data: { deadLettered: result.deadLettered } }
}

export function queueListDeadLetters(extensionId: string, topic?: string): ExtensionHostCallResult {
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
