import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDbMock = vi.fn(() => ({ db: true }))
const listAutomationRunsMock = vi.fn()
const listAutomationRulesMock = vi.fn()
const deleteAutomationRuleMock = vi.fn()
const insertAutomationRunMock = vi.fn()
const markAutomationRuleTriggeredMock = vi.fn()
const saveAutomationRuleMock = vi.fn()
const schedulerMock = {
  schedule: vi.fn(),
  unschedule: vi.fn(),
  shutdown: vi.fn(),
}

vi.mock('../../db/index.js', () => ({
  getDb: getDbMock,
}))

vi.mock('../../db/repos/automation.js', () => ({
  deleteAutomationRule: deleteAutomationRuleMock,
  insertAutomationRun: insertAutomationRunMock,
  listAutomationRules: listAutomationRulesMock,
  listAutomationRuns: listAutomationRunsMock,
  markAutomationRuleTriggered: markAutomationRuleTriggeredMock,
  saveAutomationRule: saveAutomationRuleMock,
}))

vi.mock('./cron-scheduler.js', () => ({
  getCronScheduler: () => schedulerMock,
  shutdownCronScheduler: vi.fn(),
}))

describe('automation runtime API validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDbMock.mockReturnValue({ db: true })
    listAutomationRunsMock.mockReturnValue([])
    listAutomationRulesMock.mockReturnValue([])
  })

  it('rejects malformed automation runs limits before querying runs', async () => {
    const { createAutomationRuntime } = await import('./automation.js')
    const runtime = createAutomationRuntime({
      hostCall: vi.fn(),
      queueEnqueue: vi.fn(),
    })

    await expect(runtime.extensionsCallAutomation('automation.runs.list', { limit: Number.NaN })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be a finite number' },
    })
    await expect(runtime.extensionsCallAutomation('automation.runs.list', { limit: 2.5 })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be an integer' },
    })
    await expect(runtime.extensionsCallAutomation('automation.runs.list', { limit: 0 })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be at least 1' },
    })
    await expect(runtime.extensionsCallAutomation('automation.runs.list', { limit: 501 })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be at most 500' },
    })

    expect(listAutomationRunsMock).not.toHaveBeenCalled()
  })

  it('passes normalized automation runs limits to the repository', async () => {
    const { createAutomationRuntime } = await import('./automation.js')
    const runtime = createAutomationRuntime({
      hostCall: vi.fn(),
      queueEnqueue: vi.fn(),
    })

    await expect(runtime.extensionsCallAutomation('automation.runs.list', { ruleId: 'rule-1', limit: 12 })).resolves.toEqual({
      ok: true,
      data: [],
    })
    expect(listAutomationRunsMock).toHaveBeenCalledWith({ db: true }, { ruleId: 'rule-1', limit: 12 })
  })

  it('rejects malformed scheduled task limits before listing rules', async () => {
    const { createAutomationRuntime } = await import('./automation.js')
    const runtime = createAutomationRuntime({
      hostCall: vi.fn(),
      queueEnqueue: vi.fn(),
    })

    await expect(runtime.extensionsCallAutomation('automation.list_scheduled_tasks', { limit: Number.POSITIVE_INFINITY })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be a finite number' },
    })
    await expect(runtime.extensionsCallAutomation('automation.list_scheduled_tasks', { limit: 1.25 })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be an integer' },
    })
    await expect(runtime.extensionsCallAutomation('automation.list_scheduled_tasks', { limit: 201 })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be at most 200' },
    })

    expect(listAutomationRulesMock).not.toHaveBeenCalled()
  })
})
