import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Unit tests for conversation-scoped Map cleanup functions in workspace-handlers.
 * These test the cleanup logic for projectCommandRuns (terminal runs keyed by runId
 * but filterable by conversationId).
 *
 * We replicate the minimal function bodies inline to test the logic without
 * needing the full workspace-handlers.ts module (which requires complex deps setup).
 */
describe('projectCommandRuns cleanup logic', () => {
  // Minimal mock of the projectCommandRuns Map structure
  let projectCommandRuns: Map<string, {
    conversationId: string;
    process?: { kill: (sig: string) => void };
  }>

  beforeEach(() => {
    projectCommandRuns = new Map()
  })

  function clearProjectCommandRunsForConversation(conversationId: string) {
    const runIds = Array.from(projectCommandRuns.entries())
      .filter(([, run]) => run.conversationId === conversationId)
      .map(([runId]) => runId)

    for (const runId of runIds) {
      const run = projectCommandRuns.get(runId)
      if (run?.process) {
        try {
          run.process.kill('SIGTERM')
        } catch {
          // ignore
        }
      }
      projectCommandRuns.delete(runId)
    }
  }

  it('removes all runs belonging to the given conversation', () => {
    projectCommandRuns.set('run-1', { conversationId: 'conv-A' })
    projectCommandRuns.set('run-2', { conversationId: 'conv-B' })
    projectCommandRuns.set('run-3', { conversationId: 'conv-A' })

    clearProjectCommandRunsForConversation('conv-A')

    expect(projectCommandRuns.has('run-1')).toBe(false)
    expect(projectCommandRuns.has('run-2')).toBe(true) // unaffected
    expect(projectCommandRuns.has('run-3')).toBe(false)
  })

  it('kills running processes before removing them', () => {
    const killMockA = vi.fn()
    const killMockB = vi.fn()
    projectCommandRuns.set('run-A', {
      conversationId: 'conv-X',
      process: { kill: killMockA },
    })
    projectCommandRuns.set('run-B', {
      conversationId: 'conv-X',
      process: { kill: killMockB },
    })

    clearProjectCommandRunsForConversation('conv-X')

    expect(killMockA).toHaveBeenCalledWith('SIGTERM')
    expect(killMockB).toHaveBeenCalledWith('SIGTERM')
    expect(projectCommandRuns.size).toBe(0)
  })

  it('handles missing process gracefully (no-op)', () => {
    projectCommandRuns.set('run-1', { conversationId: 'conv-Y' }) // no process
    expect(() => clearProjectCommandRunsForConversation('conv-Y')).not.toThrow()
    expect(projectCommandRuns.size).toBe(0)
  })

  it('handles process kill failure gracefully', () => {
    projectCommandRuns.set('run-1', {
      conversationId: 'conv-Z',
      process: {
        kill: vi.fn(() => {
          throw new Error('EPERM')
        }),
      },
    })

    expect(() => clearProjectCommandRunsForConversation('conv-Z')).not.toThrow()
    expect(projectCommandRuns.size).toBe(0)
  })

  it('handles nonexistent conversation id gracefully (no-op)', () => {
    projectCommandRuns.set('run-1', { conversationId: 'conv-W' })
    expect(() => clearProjectCommandRunsForConversation('nonexistent')).not.toThrow()
    expect(projectCommandRuns.size).toBe(1) // unaffected
  })

  it('handles empty map gracefully (no-op)', () => {
    expect(() => clearProjectCommandRunsForConversation('conv-whatever')).not.toThrow()
    expect(projectCommandRuns.size).toBe(0)
  })
})
