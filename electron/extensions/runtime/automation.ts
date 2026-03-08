import crypto from 'node:crypto'
import { getDb } from '../../db/index.js'
import { deleteAutomationRule, insertAutomationRun, listAutomationRules, listAutomationRuns, markAutomationRuleTriggered, saveAutomationRule } from '../../db/repos/automation.js'
import { BUILTIN_AUTOMATION_ID, AUTOMATION_TRIGGER_TOPICS } from './constants.js'
import { asRecord, parseCooldownToMs, parseTriggerDescription, safeParseJson } from './helpers.js'
import type { ExtensionHostCallResult } from './types.js'

export type AutomationTriggerTopic = (typeof AUTOMATION_TRIGGER_TOPICS)[number]

export function isAutomationTriggerTopic(value: string): value is AutomationTriggerTopic {
  return (AUTOMATION_TRIGGER_TOPICS as readonly string[]).includes(value)
}

export function evaluateConditions(conditions: unknown, eventPayload: unknown): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return true
  if (!eventPayload || typeof eventPayload !== 'object' || Array.isArray(eventPayload)) return false
  const record = eventPayload as Record<string, unknown>
  for (const condition of conditions) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return false
    const c = condition as Record<string, unknown>
    const field = typeof c.field === 'string' ? c.field : ''
    const operator = typeof c.operator === 'string' ? c.operator : 'equals'
    const value = c.value
    const actual = record[field]
    if (operator === 'equals' && actual !== value) return false
    if (operator === 'contains') {
      if (typeof actual !== 'string' || typeof value !== 'string' || !actual.includes(value)) return false
    }
  }
  return true
}

export function createAutomationRuntime(deps: {
  hostCall: (extensionId: string, method: string, params?: Record<string, unknown>) => ExtensionHostCallResult | Promise<ExtensionHostCallResult>
  queueEnqueue: (extensionId: string, topic: string, payload: unknown, opts?: { idempotencyKey?: string; availableAt?: string }) => ExtensionHostCallResult
  executePiInstruction?: (instruction: string, modelKey?: string) => Promise<{ ok: boolean; result?: string; error?: string }>
}) {
  async function executeAutomationAction(action: Record<string, unknown>, eventTopic: string, eventPayload: unknown): Promise<{ ok: boolean; error?: string }> {
    const type = typeof action.type === 'string' ? action.type : ''
    if (type === 'notify') {
      const title = typeof action.title === 'string' ? action.title : `Automation: ${eventTopic}`
      const body = typeof action.body === 'string' ? action.body : JSON.stringify(eventPayload)
      await Promise.resolve(deps.hostCall(BUILTIN_AUTOMATION_ID, 'notifications.notify', { title, body }))
      return { ok: true }
    }
    if (type === 'executeAndNotify') {
      const title = typeof action.title === 'string' ? action.title : `Automation: ${eventTopic}`
      const instruction = typeof action.instruction === 'string' ? action.instruction : ''
      const modelKey = typeof action.model === 'string' ? action.model : undefined

      if (!instruction) {
        return { ok: false, error: 'executeAndNotify action requires instruction' }
      }

      // Execute the instruction and get the result
      if (deps.executePiInstruction) {
        try {
          const execResult = await deps.executePiInstruction(instruction, modelKey)
          if (!execResult.ok) {
            return { ok: false, error: execResult.error || 'Failed to execute instruction' }
          }
          const body = execResult.result || 'No result returned'
          await Promise.resolve(deps.hostCall(BUILTIN_AUTOMATION_ID, 'notifications.notify', { title, body }))
          return { ok: true }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
      }

      return { ok: false, error: 'executePiInstruction not available' }
    }
    if (type === 'enqueueEvent') {
      const topic = typeof action.topic === 'string' ? action.topic : `automation.${eventTopic}`
      const payload = action.payload ?? eventPayload
      deps.queueEnqueue(BUILTIN_AUTOMATION_ID, topic, payload)
      return { ok: true }
    }
    if (type === 'runHostCommand') {
      const method = typeof action.method === 'string' ? action.method : ''
      if (!['notifications.notify', 'open.mainView'].includes(method)) {
        return { ok: false, error: `host command not allowed: ${method}` }
      }
      const result = await Promise.resolve(deps.hostCall(BUILTIN_AUTOMATION_ID, method, (action.params as Record<string, unknown> | undefined) ?? {}))
      return result.ok ? { ok: true } : { ok: false, error: result.error.message }
    }
    if (type === 'setConversationTag') {
      return { ok: true }
    }
    return { ok: false, error: `unsupported action type: ${type}` }
  }

  async function runAutomationOnEvent(extensionId: string, eventTopic: string, eventPayload: unknown) {
    if (extensionId !== BUILTIN_AUTOMATION_ID) return
    const db = getDb()
    const rules = listAutomationRules(db)
    const nowTs = Date.now()

    for (const rule of rules) {
      if (!rule.enabled) continue
      if (rule.trigger_topic !== eventTopic) continue

      let conditions: unknown[] = []
      let actions: Array<Record<string, unknown>> = []
      try {
        conditions = JSON.parse(rule.conditions_json) as unknown[]
      } catch {
        conditions = []
      }
      try {
        const parsed = JSON.parse(rule.actions_json) as unknown
        actions = Array.isArray(parsed) ? parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)) : []
      } catch {
        actions = []
      }

      const lastTriggered = rule.last_triggered_at ? Date.parse(rule.last_triggered_at) : 0
      if (Number.isFinite(lastTriggered) && rule.cooldown_ms > 0 && nowTs - lastTriggered < rule.cooldown_ms) {
        continue
      }

      if (!evaluateConditions(conditions, eventPayload)) {
        continue
      }

      let status: 'ok' | 'error' = 'ok'
      let errorMessage: string | undefined
      for (const action of actions) {
        const result = await executeAutomationAction(action, eventTopic, eventPayload)
        if (!result.ok) {
          status = 'error'
          errorMessage = result.error
          break
        }
      }

      markAutomationRuleTriggered(db, rule.id)
      insertAutomationRun(db, {
        id: crypto.randomUUID(),
        ruleId: rule.id,
        eventTopic,
        eventPayloadJson: JSON.stringify(eventPayload),
        status,
        errorMessage,
      })
    }
  }

  function extensionsCallAutomation(apiName: string, payload: unknown): ExtensionHostCallResult | null {
    const db = getDb()
    if (apiName === 'automation.rules.list') {
      const rules = listAutomationRules(db).map((rule) => ({
        id: rule.id,
        name: rule.name,
        enabled: Boolean(rule.enabled),
        trigger: rule.trigger_topic,
        conditions: safeParseJson(rule.conditions_json, []),
        actions: safeParseJson(rule.actions_json, []),
        cooldown: rule.cooldown_ms,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at,
      }))
      return { ok: true, data: rules }
    }
    if (apiName === 'automation.rules.save') {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { ok: false, error: { code: 'invalid_args', message: 'payload object expected' } }
      }
      const p = payload as Record<string, unknown>
      const id = typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID()
      const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null
      const trigger = typeof p.trigger === 'string' ? p.trigger : null
      if (!name || !trigger) {
        return { ok: false, error: { code: 'invalid_args', message: 'name and trigger are required' } }
      }
      if (!isAutomationTriggerTopic(trigger)) {
        return {
          ok: false,
          error: {
            code: 'invalid_args',
            message: `trigger must be one of: ${AUTOMATION_TRIGGER_TOPICS.join(', ')}`,
          },
        }
      }
      const conditions = Array.isArray(p.conditions) ? p.conditions : []
      const actions = Array.isArray(p.actions) ? p.actions : []
      const cooldown = typeof p.cooldown === 'number' && Number.isFinite(p.cooldown) ? Math.max(0, Math.floor(p.cooldown)) : 0
      saveAutomationRule(db, {
        id,
        name,
        enabled: p.enabled !== false,
        triggerTopic: trigger,
        conditionsJson: JSON.stringify(conditions),
        actionsJson: JSON.stringify(actions),
        cooldownMs: cooldown,
      })
      return { ok: true, data: { id } }
    }
    if (apiName === 'automation.rules.delete') {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
        return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
      }
      const ok = deleteAutomationRule(db, (payload as Record<string, string>).id)
      return ok ? { ok: true } : { ok: false, error: { code: 'not_found', message: 'rule not found' } }
    }
    if (apiName === 'automation.runs.list') {
      const params = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
      const rows = listAutomationRuns(db, {
        ruleId: typeof params.ruleId === 'string' ? params.ruleId : undefined,
        limit: typeof params.limit === 'number' ? params.limit : undefined,
      })
      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id,
          ruleId: row.rule_id,
          eventTopic: row.event_topic,
          eventPayload: safeParseJson(row.event_payload_json, null),
          status: row.status,
          errorMessage: row.error_message,
          createdAt: row.created_at,
        })),
      }
    }
    if (apiName === 'automation.schedule_task') {
      const params = asRecord(payload) ?? {}
      const instruction = typeof params.instruction === 'string' ? params.instruction.trim() : ''
      const name = typeof params.name === 'string' && params.name.trim()
        ? params.name.trim()
        : instruction.slice(0, 80) || 'Scheduled task'
      const triggerInput = typeof params.trigger === 'string' ? params.trigger.trim() : ''
      const trigger = isAutomationTriggerTopic(triggerInput) ? triggerInput : parseTriggerDescription(triggerInput || instruction)
      const cooldown = typeof params.cooldown === 'number' && Number.isFinite(params.cooldown)
        ? Math.max(0, Math.floor(params.cooldown))
        : parseCooldownToMs(instruction)
      if (!instruction) {
        return { ok: false, error: { code: 'invalid_args', message: 'instruction is required' } }
      }
      const action: Record<string, unknown> = {
        type: 'executeAndNotify',
        title: `Automation: ${name}`,
        instruction,
      }
      if (typeof params.projectId === 'string' && params.projectId.trim()) action.projectId = params.projectId.trim()
      if (typeof params.modelKey === 'string' && params.modelKey.trim()) action.model = params.modelKey.trim()
      const id = typeof params.id === 'string' && params.id.trim() ? params.id.trim() : crypto.randomUUID()
      saveAutomationRule(db, {
        id,
        name,
        enabled: params.enabled !== false,
        triggerTopic: trigger,
        conditionsJson: JSON.stringify(Array.isArray(params.conditions) ? params.conditions : []),
        actionsJson: JSON.stringify([action]),
        cooldownMs: cooldown,
      })
      return {
        ok: true,
        data: {
          id,
          name,
          trigger,
          cooldown,
          instruction,
        },
      }
    }
    if (apiName === 'automation.list_scheduled_tasks') {
      const params = asRecord(payload) ?? {}
      const limit = typeof params.limit === 'number' && Number.isFinite(params.limit)
        ? Math.max(1, Math.min(200, Math.floor(params.limit)))
        : 50
      const rules = listAutomationRules(db)
        .slice(0, limit)
        .map((rule) => ({
          id: rule.id,
          name: rule.name,
          enabled: Boolean(rule.enabled),
          trigger: rule.trigger_topic,
          cooldown: rule.cooldown_ms,
          lastTriggeredAt: rule.last_triggered_at,
          actions: safeParseJson(rule.actions_json, []),
          updatedAt: rule.updated_at,
        }))
      return { ok: true, data: rules }
    }
    if (apiName === 'create_task_list') {
      const params = asRecord(payload) ?? {}
      const title = typeof params.title === 'string' ? params.title.trim() : ''
      const rawTasks = Array.isArray(params.tasks) ? params.tasks : []

      if (!title) {
        return { ok: false, error: { code: 'invalid_args', message: 'title is required' } }
      }
      if (rawTasks.length === 0) {
        return { ok: false, error: { code: 'invalid_args', message: 'at least one task is required' } }
      }

      const now = Date.now()
      const tasks = rawTasks
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && !Array.isArray(t))
        .map((t, i) => ({
          id: `task-${now}-${i}`,
          title: typeof t.title === 'string' ? t.title.trim() : `Task ${i + 1}`,
          status: 'pending' as const,
          order: i,
        }))
        .filter((t) => t.title.length > 0)

      if (tasks.length === 0) {
        return { ok: false, error: { code: 'invalid_args', message: 'at least one valid task with a title is required' } }
      }

      const taskList = {
        id: `task-list-${now}`,
        title,
        tasks,
        createdAt: new Date(now).toISOString(),
      }

      const bridge = (globalThis as Record<string, unknown>).__chatonsTaskListBridge as
        | { create: (taskList: unknown) => boolean } | undefined
      if (bridge) {
        bridge.create(taskList)
      }

      return { ok: true, data: taskList }
    }
    if (apiName === 'update_task_status') {
      const params = asRecord(payload) ?? {}
      const taskId = typeof params.taskId === 'string' ? params.taskId.trim() : ''
      const status = typeof params.status === 'string' ? params.status.trim() : ''
      const errorMessage = typeof params.errorMessage === 'string' ? params.errorMessage.trim() : undefined

      if (!taskId) {
        return { ok: false, error: { code: 'invalid_args', message: 'taskId is required' } }
      }
      if (!['pending', 'in-progress', 'completed', 'error'].includes(status)) {
        return { ok: false, error: { code: 'invalid_args', message: 'status must be one of: pending, in-progress, completed, error' } }
      }

      const bridge = (globalThis as Record<string, unknown>).__chatonsTaskListBridge as
        | { updateStatus: (taskId: string, status: string, errorMessage?: string) => boolean } | undefined
      const didDispatch = bridge ? bridge.updateStatus(taskId, status, errorMessage) : false
      if (!didDispatch) {
        return { ok: false, error: { code: 'internal', message: 'failed to dispatch task status update to the UI' } }
      }

      return { ok: true, data: { taskId, status } }
    }
    if (apiName === 'display_action_suggestions') {
      const params = asRecord(payload) ?? {}
      const suggestions = Array.isArray(params.suggestions) ? params.suggestions : []
      
      // Validate and normalize suggestions
      const validated = suggestions
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && !Array.isArray(s))
        .slice(0, 4) // Max 4 suggestions for UI fit
        .map((s, i) => ({
          id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `action_${i}`,
          label: typeof s.label === 'string' ? s.label.trim().slice(0, 50) : `Option ${i + 1}`,
          message: typeof s.message === 'string' ? s.message : '',
        }))
        .filter((s) => s.label.length > 0 && s.message.trim().length > 0)
      
      if (validated.length === 0) {
        return { ok: false, error: { code: 'invalid_args', message: 'at least one valid suggestion with label and message is required' } }
      }
      
      // Use the bridge to send suggestions to the current conversation
      const bridge = (globalThis as Record<string, unknown>).__chatonsDisplayActionSuggestions as ((suggestions: Array<{ id: string; label: string; message: string }>) => boolean) | undefined
      if (bridge) {
        bridge(validated)
      }
      
      return { ok: true, data: { count: validated.length, suggestions: validated } }
    }
    return null
  }

  async function runExtensionsQueueWorkerCycle(queueConsume: (extensionId: string, topic: string, consumerId: string, opts?: { limit?: number }) => ExtensionHostCallResult, queueAck: (extensionId: string, messageId: string) => ExtensionHostCallResult, queueNack: (extensionId: string, messageId: string, retryAt?: string, errorMessage?: string) => ExtensionHostCallResult) {
    const topic = 'automation.events'
    const consume = queueConsume(BUILTIN_AUTOMATION_ID, topic, 'automation-worker', { limit: 20 })
    if (!consume.ok) return
    const messages = Array.isArray(consume.data) ? consume.data : []
    for (const message of messages) {
      const m = message as { id: string; payload?: unknown }
      try {
        if (m.payload && typeof m.payload === 'object' && !Array.isArray(m.payload)) {
          const payload = m.payload as Record<string, unknown>
          const topicName = typeof payload.topic === 'string' ? payload.topic : null
          if (topicName) {
            await runAutomationOnEvent(BUILTIN_AUTOMATION_ID, topicName, payload.payload ?? payload)
          }
        }
        queueAck(BUILTIN_AUTOMATION_ID, m.id)
      } catch (error) {
        queueNack(BUILTIN_AUTOMATION_ID, m.id, undefined, error instanceof Error ? error.message : String(error))
      }
    }
  }

  return {
    runAutomationOnEvent,
    extensionsCallAutomation,
    runExtensionsQueueWorkerCycle,
  }
}
