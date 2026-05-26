import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useModelCache } from './useModelCache'
import { logger } from '@/lib/logger'
import { workspaceIpc } from '@/services/ipc/workspace'

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/services/ipc/workspace', () => ({
  workspaceIpc: {
    listPiModels: vi.fn(),
    getPiConfigSnapshot: vi.fn(),
    syncPiModels: vi.fn(),
  },
}))

const mockedWorkspaceIpc = vi.mocked(workspaceIpc)
const mockedLogger = vi.mocked(logger)

describe('useModelCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats an empty model list as a first-run warning, not a console error', async () => {
    mockedWorkspaceIpc.listPiModels.mockResolvedValue({ ok: true, models: [] })
    mockedWorkspaceIpc.getPiConfigSnapshot.mockResolvedValue({
      settings: { enabledModels: [] },
      models: { providers: {} },
      auth: {},
    })
    mockedWorkspaceIpc.syncPiModels.mockResolvedValue({ ok: true, models: [] })

    const { result } = renderHook(() => useModelCache())

    await waitFor(() => expect(result.current.isLoadingModels).toBe(false))

    expect(result.current.models).toEqual([])
    expect(mockedLogger.warn).toHaveBeenCalledWith('No models returned from IPC:', { ok: true, models: [] })
    expect(mockedLogger.error).not.toHaveBeenCalledWith('No models returned from IPC:', expect.anything())
  })
})
