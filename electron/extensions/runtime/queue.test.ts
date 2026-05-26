import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runtimeState } from './state.js'
import type { ExtensionManifest } from './types.js'

const getDbMock = vi.fn(() => ({ db: true }))
const enqueueExtensionMessageMock = vi.fn()
const claimQueueMessagesMock = vi.fn()
const ackQueueMessageMock = vi.fn()
const nackQueueMessageMock = vi.fn()
const listQueueMessagesMock = vi.fn()

vi.mock('../../db/index.js', () => ({
  getDb: getDbMock,
}))

vi.mock('../../db/repos/extension-queue.js', () => ({
  ackQueueMessage: ackQueueMessageMock,
  claimQueueMessages: claimQueueMessagesMock,
  enqueueExtensionMessage: enqueueExtensionMessageMock,
  listQueueMessages: listQueueMessagesMock,
  nackQueueMessage: nackQueueMessageMock,
}))

const manifest = (id: string, capabilities: ExtensionManifest['capabilities']): ExtensionManifest => ({
  id,
  name: id,
  version: '1.0.0',
  capabilities,
})

function resetRuntimeState() {
  runtimeState.manifests.clear()
  runtimeState.extensionRoots.clear()
  runtimeState.subscriptions.clear()
  runtimeState.capabilityUsage.clear()
  runtimeState.serverProcesses.clear()
  runtimeState.serverStatus.clear()
  runtimeState.channelStatus.clear()
}

describe('extension runtime queue validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDbMock.mockReturnValue({ db: true })
    enqueueExtensionMessageMock.mockReturnValue({ id: 'message-1', deduplicated: false })
    claimQueueMessagesMock.mockReturnValue([])
    ackQueueMessageMock.mockReturnValue(true)
    nackQueueMessageMock.mockReturnValue({ ok: true, deadLettered: false })
    listQueueMessagesMock.mockReturnValue([])
    resetRuntimeState()
  })

  it('rejects invalid extension ids before capability lookup and database writes', async () => {
    const { queueEnqueue } = await import('./queue.js')
    runtimeState.manifests.set('@chaton/queue-test', manifest('@chaton/queue-test', ['queue.publish']))

    const result = queueEnqueue('../outside', 'safe.topic', { ok: true })

    expect(result).toEqual({ ok: false, error: { code: 'invalid_args', message: 'invalid extensionId' } })
    expect(enqueueExtensionMessageMock).not.toHaveBeenCalled()
    expect(getDbMock).not.toHaveBeenCalled()
    expect(runtimeState.capabilityUsage.size).toBe(0)
  })

  it('rejects malformed topics before database writes but trims valid topics', async () => {
    const { publishExtensionEvent, queueEnqueue } = await import('./queue.js')
    runtimeState.manifests.set('@chaton/queue-test', manifest('@chaton/queue-test', ['queue.publish', 'events.publish']))

    expect(queueEnqueue('@chaton/queue-test', 'bad topic', { ok: true })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'topic can only contain letters, numbers, dots, underscores, colons and hyphens' },
    })
    expect(enqueueExtensionMessageMock).not.toHaveBeenCalled()

    expect(publishExtensionEvent('@chaton/queue-test', ' other.bad ', { ok: true })).toEqual({
      ok: true,
      data: { messageId: 'message-1', deduplicated: false },
    })
    expect(enqueueExtensionMessageMock).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({ topic: 'other.bad' }),
    )
  })

  it('normalizes queue enqueue options and preserves consume ack flow', async () => {
    const { queueAck, queueConsume, queueEnqueue } = await import('./queue.js')
    runtimeState.manifests.set('@chaton/queue-test', manifest('@chaton/queue-test', ['queue.publish', 'queue.consume']))
    claimQueueMessagesMock.mockReturnValue([
      {
        id: 'message-1',
        topic: 'work.item',
        payload_json: '{"value":1}',
        attempts: 0,
        created_at: '2026-05-26T18:00:00.000Z',
      },
    ])

    const enqueue = queueEnqueue('@chaton/queue-test', 'work.item', { value: 1 }, {
      availableAt: '2026-05-26T20:00:00+02:00',
      idempotencyKey: ' key-1 ',
    })
    expect(enqueue.ok).toBe(true)
    expect(enqueueExtensionMessageMock).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({
        topic: 'work.item',
        availableAt: '2026-05-26T18:00:00.000Z',
        idempotencyKey: 'key-1',
      }),
    )

    const consume = queueConsume('@chaton/queue-test', 'work.item', ' worker-1 ', { limit: 10 })
    expect(consume).toEqual({
      ok: true,
      data: [
        {
          id: 'message-1',
          topic: 'work.item',
          payload: { value: 1 },
          attempts: 0,
          createdAt: '2026-05-26T18:00:00.000Z',
        },
      ],
    })
    expect(claimQueueMessagesMock).toHaveBeenCalledWith({ db: true }, { topic: 'work.item', consumerId: 'worker-1', limit: 10 })

    expect(queueAck('@chaton/queue-test', 'message-1')).toEqual({ ok: true })
    expect(ackQueueMessageMock).toHaveBeenCalledWith({ db: true }, 'message-1')
  })

  it('rejects malformed queue consume options before capability tracking or DB access', async () => {
    const { queueConsume } = await import('./queue.js')
    runtimeState.manifests.set('@chaton/queue-test', manifest('@chaton/queue-test', ['queue.consume']))

    expect(queueConsume('@chaton/queue-test', 'work.item', 'worker-1', 'bad-opts' as unknown as { limit?: number })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'opts must be an object' },
    })
    expect(queueConsume('@chaton/queue-test', 'work.item', 'worker-1', { limit: '5' as unknown as number })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be a finite number' },
    })
    expect(queueConsume('@chaton/queue-test', 'work.item', 'worker-1', { limit: Number.NaN })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be a finite number' },
    })
    expect(queueConsume('@chaton/queue-test', 'work.item', 'worker-1', { limit: 1.5 })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be an integer' },
    })
    expect(queueConsume('@chaton/queue-test', 'work.item', 'worker-1', { limit: 0 })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be at least 1' },
    })
    expect(queueConsume('@chaton/queue-test', 'work.item', 'worker-1', { limit: 101 })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be at most 100' },
    })

    expect(claimQueueMessagesMock).not.toHaveBeenCalled()
    expect(getDbMock).not.toHaveBeenCalled()
    expect(runtimeState.capabilityUsage.size).toBe(0)
  })

  it('treats null queue consume limit as absent', async () => {
    const { queueConsume } = await import('./queue.js')
    runtimeState.manifests.set('@chaton/queue-test', manifest('@chaton/queue-test', ['queue.consume']))

    expect(queueConsume('@chaton/queue-test', 'work.item', 'worker-1', { limit: null as unknown as number })).toEqual({
      ok: true,
      data: [],
    })
    expect(claimQueueMessagesMock).toHaveBeenCalledWith(
      { db: true },
      { topic: 'work.item', consumerId: 'worker-1', limit: undefined },
    )
  })

  it('rejects invalid consumer message retry and idempotency fields', async () => {
    const { publishExtensionEvent, queueAck, queueConsume, queueEnqueue, queueNack } = await import('./queue.js')
    runtimeState.manifests.set('@chaton/queue-test', manifest('@chaton/queue-test', ['events.publish', 'queue.publish', 'queue.consume']))

    expect(publishExtensionEvent('@chaton/queue-test', 'event.topic', {}, 'bad-meta' as unknown as { idempotencyKey?: string })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'meta must be an object' },
    })
    expect(publishExtensionEvent('@chaton/queue-test', 'event.topic', {}, { idempotencyKey: { key: 'bad' } as unknown as string })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'idempotencyKey must be a string' },
    })
    expect(queueEnqueue('@chaton/queue-test', 'work.item', {}, 'bad-opts' as unknown as { idempotencyKey?: string })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'opts must be an object' },
    })
    expect(queueEnqueue('@chaton/queue-test', 'work.item', {}, { idempotencyKey: `bad${String.fromCharCode(7)}` })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'idempotencyKey cannot contain control characters' },
    })
    expect(queueEnqueue('@chaton/queue-test', 'work.item', {}, { idempotencyKey: 123 as unknown as string })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'idempotencyKey must be a string' },
    })
    expect(queueEnqueue('@chaton/queue-test', 'work.item', {}, { availableAt: { date: 'tomorrow' } as unknown as string })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'availableAt must be a string' },
    })
    expect(queueConsume('@chaton/queue-test', 'work.item', 'bad consumer')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'consumerId can only contain letters, numbers, dots, underscores, colons and hyphens' },
    })
    expect(queueAck('@chaton/queue-test', 'bad message')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'messageId can only contain letters, numbers, dots, underscores, colons and hyphens' },
    })
    expect(queueNack('@chaton/queue-test', 'message-1', 'not-a-date')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'retryAt must be a valid ISO date' },
    })
    expect(queueNack('@chaton/queue-test', 'message-1', 123 as unknown as string)).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'retryAt must be a string' },
    })
    expect(queueNack('@chaton/queue-test', 'message-1', undefined, { reason: 'failed' } as unknown as string)).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'errorMessage must be a string' },
    })
    expect(enqueueExtensionMessageMock).not.toHaveBeenCalled()
    expect(claimQueueMessagesMock).not.toHaveBeenCalled()
    expect(ackQueueMessageMock).not.toHaveBeenCalled()
    expect(nackQueueMessageMock).not.toHaveBeenCalled()
  })

  it('treats null optional queue fields as absent without throwing', async () => {
    const { publishExtensionEvent, queueEnqueue, queueNack } = await import('./queue.js')
    runtimeState.manifests.set('@chaton/queue-test', manifest('@chaton/queue-test', ['events.publish', 'queue.publish', 'queue.consume']))

    expect(publishExtensionEvent('@chaton/queue-test', 'event.topic', { ok: true }, { idempotencyKey: null as unknown as string })).toEqual({
      ok: true,
      data: { messageId: 'message-1', deduplicated: false },
    })
    expect(queueEnqueue('@chaton/queue-test', 'work.item', { ok: true }, {
      availableAt: null as unknown as string,
      idempotencyKey: null as unknown as string,
    })).toEqual({ ok: true, data: { id: 'message-1', deduplicated: false } })
    expect(queueNack('@chaton/queue-test', 'message-1', null as unknown as string, null as unknown as string)).toEqual({
      ok: true,
      data: { deadLettered: false },
    })
    expect(enqueueExtensionMessageMock).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({ idempotencyKey: undefined, availableAt: undefined }),
    )
    expect(nackQueueMessageMock).toHaveBeenCalledWith(
      { db: true },
      { id: 'message-1', retryAt: undefined, error: undefined },
    )
  })

  it('rejects unserializable and oversized event payloads before capability tracking or DB access', async () => {
    const { publishExtensionEvent, queueEnqueue } = await import('./queue.js')
    runtimeState.manifests.set('@chaton/queue-test', manifest('@chaton/queue-test', ['events.publish', 'queue.publish']))
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(publishExtensionEvent('@chaton/queue-test', 'event.topic', circular)).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'payload must be JSON serializable' },
    })
    expect(queueEnqueue('@chaton/queue-test', 'work.item', 'x'.repeat(256 * 1024 + 1))).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'payload too large' },
    })
    expect(enqueueExtensionMessageMock).not.toHaveBeenCalled()
    expect(getDbMock).not.toHaveBeenCalled()
    expect(runtimeState.capabilityUsage.size).toBe(0)
  })

  it('rejects invalid automation event names before capability tracking or DB access', async () => {
    const { publishExtensionAutomationEvent } = await import('./queue.js')
    runtimeState.manifests.set('@chaton/queue-test', manifest('@chaton/queue-test', ['events.publish']))

    expect(publishExtensionAutomationEvent('@chaton/queue-test', 'bad event', { ok: true })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'event name can only contain letters, numbers, underscores and hyphens' },
    })
    expect(enqueueExtensionMessageMock).not.toHaveBeenCalled()
    expect(getDbMock).not.toHaveBeenCalled()
    expect(runtimeState.capabilityUsage.size).toBe(0)
  })

  it('trims valid automation event names and enqueues bounded payloads', async () => {
    const { publishExtensionAutomationEvent } = await import('./queue.js')
    runtimeState.manifests.set('@chaton/queue-test', manifest('@chaton/queue-test', ['events.publish']))

    expect(publishExtensionAutomationEvent('@chaton/queue-test', ' job_done ', { ok: true })).toEqual({
      ok: true,
      data: { messageId: 'message-1', deduplicated: false },
    })
    expect(enqueueExtensionMessageMock).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({ topic: 'extension.job_done', payload: { ok: true } }),
    )
    expect(runtimeState.capabilityUsage.get('@chaton/queue-test')?.has('events.publish')).toBe(true)
  })
})
