import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Capability } from './types.js'
import { runtimeState, clearExtensionRuntimeState } from './state.js'

describe('clearExtensionRuntimeState', () => {
  beforeEach(() => {
    // Reset all Maps before each test
    runtimeState.manifests.clear()
    runtimeState.extensionRoots.clear()
    runtimeState.subscriptions.clear()
    runtimeState.capabilityUsage.clear()
    runtimeState.serverProcesses.clear()
    runtimeState.serverStatus.clear()
    runtimeState.channelStatus.clear()
  })

  it('removes an extension id from all runtime state Maps', () => {
    // Populate state with data for two extensions
    runtimeState.manifests.set('ext-a', { id: 'ext-a', version: '1.0.0' } as never)
    runtimeState.extensionRoots.set('ext-a', '/path/to/ext-a')
    runtimeState.subscriptions.set('ext-a', { id: 'ext-a', events: [] } as never)
    runtimeState.capabilityUsage.set('ext-a', new Set(['cap-a']) as unknown as Set<Capability>)
    runtimeState.serverStatus.set('ext-a', { startedAt: '2024-01-01', ready: true })
    runtimeState.channelStatus.set('ext-a', { configured: true, connected: true, updatedAt: '2024-01-01' } as never)

    // ext-b stays
    runtimeState.manifests.set('ext-b', { id: 'ext-b', version: '1.0.0' } as never)
    runtimeState.extensionRoots.set('ext-b', '/path/to/ext-b')

    clearExtensionRuntimeState('ext-a')

    expect(runtimeState.manifests.has('ext-a')).toBe(false)
    expect(runtimeState.manifests.has('ext-b')).toBe(true)
    expect(runtimeState.extensionRoots.has('ext-a')).toBe(false)
    expect(runtimeState.extensionRoots.has('ext-b')).toBe(true)
    expect(runtimeState.subscriptions.has('ext-a')).toBe(false)
    expect(runtimeState.capabilityUsage.has('ext-a')).toBe(false)
    expect(runtimeState.serverStatus.has('ext-a')).toBe(false)
    expect(runtimeState.channelStatus.has('ext-a')).toBe(false)
  })

  it('kills the server process before removing it from the Map', () => {
    const killMock = vi.fn()
    const mockChild = { kill: killMock } as unknown as import('node:child_process').ChildProcess

    runtimeState.serverProcesses.set('ext-a', mockChild)
    runtimeState.serverProcesses.set('ext-b', mockChild)

    clearExtensionRuntimeState('ext-a')

    expect(killMock).toHaveBeenCalledWith('SIGTERM')
    expect(runtimeState.serverProcesses.has('ext-a')).toBe(false)
    // ext-b is unaffected
    expect(runtimeState.serverProcesses.has('ext-b')).toBe(true)
  })

  it('handles a missing extension id gracefully (no-op)', () => {
    // Should not throw
    expect(() => clearExtensionRuntimeState('nonexistent')).not.toThrow()

    // Maps should remain empty
    expect(runtimeState.manifests.size).toBe(0)
    expect(runtimeState.serverProcesses.size).toBe(0)
  })

  it('handles a server kill failure gracefully', () => {
    const mockChild = {
      kill: vi.fn(() => {
        throw new Error('EPERM')
      }),
    } as unknown as import('node:child_process').ChildProcess

    runtimeState.serverProcesses.set('ext-a', mockChild)
    runtimeState.manifests.set('ext-a', { id: 'ext-a', version: '1.0.0' } as never)

    // Should not throw even if kill fails
    expect(() => clearExtensionRuntimeState('ext-a')).not.toThrow()

    // But the Map entry should still be cleaned up
    expect(runtimeState.serverProcesses.has('ext-a')).toBe(false)
    expect(runtimeState.manifests.has('ext-a')).toBe(false)
  })
})
