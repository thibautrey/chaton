import path from 'node:path'
import { getDb } from '../../db/index.js'
import { insertConversation } from '../../db/repos/conversations.js'
import type { PiSessionRuntimeManager } from '../../pi-sdk-runtime.js'

/**
 * Creates an ephemeral Pi session, executes an instruction, and returns the result.
 * This is used by the automation extension to execute instructions and send results via notifications.
 */
export function createPiInstructionExecutor(piRuntimeManager: PiSessionRuntimeManager) {
  return async (instruction: string, modelKey?: string): Promise<{ ok: boolean; result?: string; error?: string }> => {
    try {
      // Generate a unique conversation ID for this ephemeral execution
      const ephemeralConversationId = `automation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

      // Create an ephemeral conversation entry in the database
      const db = getDb()
      insertConversation(db, {
        id: ephemeralConversationId,
        projectId: null,
        title: 'Automation Task',
      })

      // Start the Pi session
      const startResult = await piRuntimeManager.start(ephemeralConversationId)
      if (!startResult.ok) {
        return {
          ok: false,
          error: startResult.message || 'Failed to initialize Pi session',
        }
      }

      // Set model if provided
      if (modelKey) {
        const [provider, id] = modelKey.split('/')
        if (provider && id) {
          await piRuntimeManager.sendCommand(ephemeralConversationId, {
            type: 'set_model',
            provider,
            modelId: id,
          })
        }
      }

      // Send the instruction as a prompt
      const response = await piRuntimeManager.sendCommand(ephemeralConversationId, {
        type: 'prompt',
        message: instruction,
      })

      if (!response.success) {
        return {
          ok: false,
          error: response.error || 'Failed to execute instruction',
        }
      }

      // Extract the result from the snapshot
      const snapshot = await piRuntimeManager.getSnapshot(ephemeralConversationId)
      if (!snapshot.messages || snapshot.messages.length === 0) {
        return {
          ok: false,
          error: 'No response received from AI',
        }
      }

      // Find the latest assistant message
      let result = ''
      for (let i = snapshot.messages.length - 1; i >= 0; i--) {
        const msg = snapshot.messages[i] as Record<string, unknown> | undefined
        if (!msg) continue

        const role = typeof msg.role === 'string' ? msg.role : ''
        if (role !== 'assistant') continue

        const content = Array.isArray(msg.content) ? msg.content : []
        for (const part of content) {
          if (part && typeof part === 'object' && !Array.isArray(part)) {
            const p = part as Record<string, unknown>
            if (p.type === 'text' && typeof p.text === 'string') {
              result = p.text
            }
          }
        }

        if (result) break
      }

      // Clean up - stop the ephemeral session
      void piRuntimeManager.stop(ephemeralConversationId)

      return {
        ok: true,
        result: result || 'No result generated',
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
