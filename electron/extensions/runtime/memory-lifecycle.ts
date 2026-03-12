/**
 * Memory lifecycle management for Chatons.
 *
 * Handles:
 * - Auto-summarizing conversations when they end (agent_end)
 * - Storing summaries as project-scoped or global memory entries
 * - Background consolidation of duplicate/overlapping memories
 * - Retrieving relevant memory context for new conversations
 */

import crypto from 'node:crypto'
import { getDb } from '../../db/index.js'
import {
  findConversationById,
  listConversationMessagesCache,
} from '../../db/repos/conversations.js'
import { memoryUpsert, memorySearch, memoryList } from './memory.js'
import { parseModelKey } from './helpers.js'
import type { PiSessionRuntimeManager } from '../../pi-sdk-runtime.js'

// ── Settings helpers ────────────────────────────────────────────────────────

const MEMORY_MODEL_SETTINGS_KEY = 'memory_model'

export function getMemoryModelPreference(): string | null {
  const db = getDb()
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(MEMORY_MODEL_SETTINGS_KEY) as { value: string } | undefined
  return row?.value ?? null
}

export function setMemoryModelPreference(modelKey: string | null) {
  const db = getDb()
  const now = new Date().toISOString()
  if (modelKey) {
    db.prepare(
      `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    ).run(MEMORY_MODEL_SETTINGS_KEY, modelKey, now)
  } else {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(MEMORY_MODEL_SETTINGS_KEY)
  }
}

// ── Conversation text extraction ────────────────────────────────────────────

function extractConversationText(conversationId: string): string | null {
  const db = getDb()
  const rows = listConversationMessagesCache(db, conversationId)
  if (rows.length === 0) return null

  const parts: string[] = []
  for (const row of rows) {
    try {
      const msg = JSON.parse(row.payload_json) as Record<string, unknown>
      const role = typeof msg.role === 'string' ? msg.role : ''
      if (role !== 'user' && role !== 'assistant') continue

      const content = msg.content
      let text = ''
      if (typeof content === 'string') {
        text = content
      } else if (Array.isArray(content)) {
        text = content
          .filter(
            (part): part is { type: 'text'; text: string } =>
              !!part &&
              typeof part === 'object' &&
              (part as Record<string, unknown>).type === 'text' &&
              typeof (part as Record<string, unknown>).text === 'string',
          )
          .map((part) => part.text)
          .join('\n')
      }
      if (text.trim()) {
        parts.push(`${role === 'user' ? 'User' : 'Assistant'}: ${text.trim()}`)
      }
    } catch {
      // skip malformed messages
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : null
}

// ── Summarization ───────────────────────────────────────────────────────────

const SUMMARIZE_PROMPT = `You are a memory summarizer for an AI coding assistant called Chatons.

Summarize the following conversation into concise, factual memory entries. Focus on:
- What the user wanted to achieve
- Key decisions made
- Technical details that would be useful for future conversations (file paths, architecture choices, patterns used)
- Preferences or style choices the user expressed
- Any problems encountered and how they were resolved

Output a single paragraph summary (2-5 sentences). Be factual and concise. Do NOT include greetings, meta-commentary, or filler. Only output the summary text, nothing else.

Conversation:
`

/**
 * Summarize a conversation using a Pi session and store the result in memory.
 * Returns the memory entry id, or null if the conversation was too short to summarize.
 */
export async function summarizeAndStoreConversation(
  conversationId: string,
  piRuntimeManager: PiSessionRuntimeManager,
  opts?: { modelKey?: string },
): Promise<string | null> {
  const conversationText = extractConversationText(conversationId)
  if (!conversationText || conversationText.length < 200) {
    // Too short to be worth summarizing
    return null
  }

  const db = getDb()
  const conversation = findConversationById(db, conversationId)
  if (!conversation) return null

  // Determine which model to use: configured memory model > last-used model
  const memoryModel = getMemoryModelPreference()
  const modelKey =
    opts?.modelKey ??
    memoryModel ??
    (conversation.model_provider && conversation.model_id
      ? `${conversation.model_provider}/${conversation.model_id}`
      : null)

  // Truncate conversation text to avoid exceeding context limits
  const maxChars = 12000
  const truncatedText =
    conversationText.length > maxChars
      ? conversationText.slice(0, maxChars) + '\n\n[...truncated]'
      : conversationText

  const instruction = SUMMARIZE_PROMPT + truncatedText

  // Create an ephemeral conversation for the summarization
  const ephemeralId = `memory-summarize-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  try {
    const { insertConversation } = await import('../../db/repos/conversations.js')
    insertConversation(db, {
      id: ephemeralId,
      projectId: conversation.project_id,
      title: 'Memory Summarization',
      hiddenFromSidebar: true,
    })

    const startResult = await piRuntimeManager.start(ephemeralId)
    if (!startResult.ok) {
      console.warn('[Memory] Failed to start summarization session:', startResult)
      return null
    }

    // Set model if specified
    if (modelKey) {
      const parsed = parseModelKey(modelKey)
      if (parsed) {
        await piRuntimeManager.sendCommand(ephemeralId, {
          type: 'set_model',
          provider: parsed.provider,
          modelId: parsed.modelId,
        })
      }
    }

    const response = await piRuntimeManager.sendCommand(ephemeralId, {
      type: 'prompt',
      message: instruction,
    })

    if (!response.success) {
      console.warn('[Memory] Summarization failed:', response.error)
      return null
    }

    // Extract the summary from the snapshot
    const snapshot = await piRuntimeManager.getSnapshot(ephemeralId)
    let summary = ''
    const messages = Array.isArray(snapshot.messages) ? snapshot.messages : []
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as Record<string, unknown> | null
      if (!msg) continue
      const role = typeof msg.role === 'string' ? msg.role : ''
      if (role !== 'assistant') continue
      const content = Array.isArray(msg.content) ? msg.content : []
      for (const part of content) {
        const p = part as Record<string, unknown> | null
        if (p?.type === 'text' && typeof p.text === 'string') {
          summary = p.text.trim()
        }
      }
      if (summary) break
    }

    if (!summary || summary.length < 20) {
      return null
    }

    // Store the summary in memory
    const projectId = conversation.project_id
    const scope = projectId ? 'project' : 'global'
    const memoryId = crypto.randomUUID()

    const result = memoryUpsert({
      id: memoryId,
      scope,
      projectId: projectId ?? undefined,
      kind: 'conversation-summary',
      title: conversation.title || 'Conversation summary',
      content: summary,
      tags: ['auto-summary'],
      source: 'auto-conversation-end',
      conversationId,
    })

    return result.ok ? memoryId : null
  } catch (error) {
    console.warn('[Memory] Error during summarization:', error)
    return null
  } finally {
    // Cleanup ephemeral session
    void piRuntimeManager.stop(ephemeralId).catch(() => {})
  }
}

// ── Memory retrieval for conversation context ───────────────────────────────

/**
 * Retrieve relevant memory entries for a conversation and format them
 * as a hidden steer message that provides context to the AI.
 */
export function buildMemoryContextMessage(
  conversationId: string,
  query: string,
): string | null {
  const db = getDb()
  const conversation = findConversationById(db, conversationId)
  if (!conversation) return null

  const projectId = conversation.project_id

  // Search for relevant memories scoped to this project (or global)
  const searchResult = memorySearch({
    query,
    scope: projectId ? 'project' : 'global',
    projectId: projectId ?? undefined,
    limit: 8,
    includeArchived: false,
  })

  if (!searchResult.ok) return null

  const entries = searchResult.data as Array<{
    title: string | null
    content: string
    kind: string
    score: number
    tags: string[]
  }>

  // Filter out low-relevance matches
  const relevant = entries.filter((e) => e.score > 0.15)
  if (relevant.length === 0) return null

  const lines = [
    '## Context from Past Memories',
    '',
    'The following information comes from summaries of past conversations and stored knowledge.',
    'These memories may not be 100% accurate or up-to-date, but they can help guide your approach.',
    'Use them as background context, not as absolute truth. If something seems contradictory to the current request, prioritize what the user is asking now.',
    '',
  ]

  for (const entry of relevant) {
    const title = entry.title ? `**${entry.title}**` : ''
    const kindTag = entry.kind !== 'fact' ? ` [${entry.kind}]` : ''
    lines.push(`- ${title}${kindTag}: ${entry.content}`)
  }

  return lines.join('\n')
}

// ── Memory consolidation ────────────────────────────────────────────────────

const CONSOLIDATION_PROMPT = `You are a memory manager for an AI coding assistant called Chatons.

Below are several memory entries that may contain overlapping, redundant, or related information. Your job is to consolidate them into fewer, more concise entries.

Rules:
- Merge entries that describe the same topic or project
- Remove redundant information
- Preserve all unique technical details (file paths, architecture decisions, patterns)
- Preserve user preferences
- Each output entry should be a concise paragraph (1-3 sentences)
- Output entries as a JSON array of objects with "title" and "content" fields
- Output ONLY the JSON array, no explanation

Memory entries to consolidate:
`

/**
 * Background job that consolidates memory entries by grouping duplicates
 * and merging overlapping content. Runs periodically.
 */
export async function consolidateMemory(
  piRuntimeManager: PiSessionRuntimeManager,
): Promise<{ merged: number; deleted: number }> {
  const db = getDb()
  let totalMerged = 0
  let totalDeleted = 0

  // Process each scope independently (global + each project)
  const scopes: Array<{ scope: 'global' | 'project'; projectId?: string }> = [
    { scope: 'global' },
  ]

  // Get all distinct project IDs from memory entries
  const projectRows = db
    .prepare(
      "SELECT DISTINCT project_id FROM memory_entries WHERE scope = 'project' AND archived = 0 AND project_id IS NOT NULL",
    )
    .all() as Array<{ project_id: string }>
  for (const row of projectRows) {
    scopes.push({ scope: 'project', projectId: row.project_id })
  }

  for (const scopeConfig of scopes) {
    const listResult = memoryList({
      scope: scopeConfig.scope,
      projectId: scopeConfig.projectId,
      kind: 'conversation-summary',
      includeArchived: false,
      limit: 200,
    })
    if (!listResult.ok) continue

    const entries = listResult.data as Array<{
      id: string
      title: string | null
      content: string
      kind: string
      tags: string[]
    }>

    // Only consolidate if there are enough entries to warrant it
    if (entries.length < 5) continue

    // Batch entries for consolidation (process 10 at a time)
    const batchSize = 10
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)
      if (batch.length < 3) continue

      const memoryText = batch
        .map((e, idx) => `Entry ${idx + 1}: ${e.title ? `[${e.title}] ` : ''}${e.content}`)
        .join('\n\n')

      const instruction = CONSOLIDATION_PROMPT + memoryText

      // Determine which model to use
      const memoryModel = getMemoryModelPreference()

      const ephemeralId = `memory-consolidate-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      try {
        const { insertConversation } = await import('../../db/repos/conversations.js')
        insertConversation(db, {
          id: ephemeralId,
          projectId: scopeConfig.projectId ?? null,
          title: 'Memory Consolidation',
          hiddenFromSidebar: true,
        })

        const startResult = await piRuntimeManager.start(ephemeralId)
        if (!startResult.ok) continue

        if (memoryModel) {
          const parsed = parseModelKey(memoryModel)
          if (parsed) {
            await piRuntimeManager.sendCommand(ephemeralId, {
              type: 'set_model',
              provider: parsed.provider,
              modelId: parsed.modelId,
            })
          }
        }

        const response = await piRuntimeManager.sendCommand(ephemeralId, {
          type: 'prompt',
          message: instruction,
        })

        if (!response.success) continue

        const snapshot = await piRuntimeManager.getSnapshot(ephemeralId)
        let resultText = ''
        const messages = Array.isArray(snapshot.messages) ? snapshot.messages : []
        for (let j = messages.length - 1; j >= 0; j--) {
          const msg = messages[j] as Record<string, unknown> | null
          if (!msg || msg.role !== 'assistant') continue
          const content = Array.isArray(msg.content) ? msg.content : []
          for (const part of content) {
            const p = part as Record<string, unknown> | null
            if (p?.type === 'text' && typeof p.text === 'string') {
              resultText = p.text.trim()
            }
          }
          if (resultText) break
        }

        // Parse the consolidated entries
        const jsonMatch = resultText.match(/\[[\s\S]*\]/)
        if (!jsonMatch) continue

        let consolidated: Array<{ title?: string; content?: string }> = []
        try {
          consolidated = JSON.parse(jsonMatch[0]) as Array<{
            title?: string
            content?: string
          }>
        } catch {
          continue
        }

        if (!Array.isArray(consolidated) || consolidated.length === 0) continue

        // Archive old entries and insert consolidated ones
        const { memoryUpdate, memoryDelete } = await import('./memory.js')
        for (const entry of batch) {
          memoryUpdate({ id: entry.id, archived: true })
          totalDeleted++
        }

        for (const newEntry of consolidated) {
          if (!newEntry.content || typeof newEntry.content !== 'string') continue
          memoryUpsert({
            scope: scopeConfig.scope,
            projectId: scopeConfig.projectId,
            kind: 'conversation-summary',
            title:
              typeof newEntry.title === 'string' ? newEntry.title : 'Consolidated memory',
            content: newEntry.content,
            tags: ['auto-summary', 'consolidated'],
            source: 'auto-consolidation',
          })
          totalMerged++
        }
      } catch (error) {
        console.warn('[Memory] Consolidation batch error:', error)
      } finally {
        void piRuntimeManager.stop(ephemeralId).catch(() => {})
      }
    }
  }

  return { merged: totalMerged, deleted: totalDeleted }
}
