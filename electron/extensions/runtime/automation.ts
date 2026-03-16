import crypto from 'node:crypto'
import { getDb } from '../../db/index.js'
import { deleteAutomationRule, insertAutomationRun, listAutomationRules, listAutomationRuns, markAutomationRuleTriggered, saveAutomationRule } from '../../db/repos/automation.js'

import { BUILTIN_AUTOMATION_ID, AUTOMATION_TRIGGER_TOPICS } from './constants.js'
import { asRecord, parseCooldownToMs, parseTriggerDescription, safeParseJson, parseCronExpression, isValidCronExpression } from './helpers.js'
import { getCronScheduler, shutdownCronScheduler } from './cron-scheduler.js'
import type { ExtensionHostCallResult } from './types.js'

export type AutomationTriggerTopic = (typeof AUTOMATION_TRIGGER_TOPICS)[number]

export function isAutomationTriggerTopic(value: string): value is AutomationTriggerTopic {
  return (AUTOMATION_TRIGGER_TOPICS as readonly string[]).includes(value)
}

export function isExtensionEventTopic(value: string): boolean {
  return value.startsWith('extension.')
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
          console.log('[Automation] Sending executeAndNotify notification with result:', { title, resultLength: body.length, resultPreview: body.slice(0, 100) })
          await Promise.resolve(deps.hostCall(BUILTIN_AUTOMATION_ID, 'notifications.notify', { title: title, body: body }))
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
    const db = getDb()
    const rules = listAutomationRules(db)
    const nowTs = Date.now()

    for (const rule of rules) {
      if (!rule.enabled) continue
      
      // For extension events, match both specific event names and the generic 'extension.event' trigger
      if (isExtensionEventTopic(eventTopic)) {
        if (rule.trigger_topic !== eventTopic && rule.trigger_topic !== 'extension.event') {
          continue
        }
      } else {
        if (rule.trigger_topic !== eventTopic) continue
      }

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

      // Auto-disable run-once rules after execution
      if (rule.run_once) {
        db.prepare('UPDATE automation_rules SET enabled = 0, updated_at = ? WHERE id = ?').run(Date.now(), rule.id)
        console.log(`[Automation] Run-once rule "${rule.name}" (${rule.id}) auto-disabled after execution`)
      }
    }
  }

  async function initializeCronTasks() {
    const db = getDb()
    const rules = listAutomationRules(db)
    const scheduler = await getCronScheduler()

    for (const rule of rules) {
      if (!rule.enabled || rule.trigger_topic !== 'cron') continue

      const cronExpression = rule.trigger_data || rule.trigger_topic
      if (!isValidCronExpression(cronExpression)) {
        console.warn(`[Automation] Invalid cron expression for rule "${rule.id}": ${cronExpression}`)
        continue
      }

      const onTick = async () => {
        await runAutomationOnEvent(BUILTIN_AUTOMATION_ID, 'cron', { ruleId: rule.id, triggeredAt: new Date().toISOString() })
      }

      const scheduled = await scheduler.schedule(rule.id, cronExpression, onTick)
      if (scheduled) {
        console.log(`[Automation] Cron task scheduled: "${rule.name}" (${rule.id}) at "${cronExpression}"`)
      }
    }
  }

  async function updateCronTask(ruleId: string, enabled: boolean, cronExpression?: string) {
    const scheduler = await getCronScheduler()

    if (!enabled) {
      scheduler.stop(ruleId)
      return
    }

    if (!cronExpression) {
      const db = getDb()
      const rules = listAutomationRules(db)
      const rule = rules.find((r) => r.id === ruleId)
      if (!rule) return
      cronExpression = rule.trigger_data || rule.trigger_topic
    }

    if (!isValidCronExpression(cronExpression)) {
      console.error(`[Automation] Invalid cron expression for rule "${ruleId}": ${cronExpression}`)
      return
    }

    const db = getDb()
    const rule = listAutomationRules(db).find((r) => r.id === ruleId)
    if (!rule) return

    const onTick = async () => {
      await runAutomationOnEvent(BUILTIN_AUTOMATION_ID, 'cron', { ruleId, triggeredAt: new Date().toISOString() })
    }

    await scheduler.schedule(ruleId, cronExpression, onTick)
  }

  async function extensionsCallAutomation(apiName: string, payload: unknown, context?: { conversationId?: string }): Promise<ExtensionHostCallResult> {
    let db: ReturnType<typeof getDb> | undefined
    try {
      db = getDb()
    } catch (dbErr) {
      console.error('[Automation] Failed to get database:', dbErr)
      return { ok: false, error: { code: 'db_error', message: 'Database connection failed: ' + (dbErr instanceof Error ? dbErr.message : String(dbErr)) } }
    }

    if (apiName === 'automation.rules.list') {
      try {
        const rules = listAutomationRules(db).map((rule) => ({
          id: rule.id,
          name: rule.name,
          enabled: Boolean(rule.enabled),
          trigger: rule.trigger_topic,
          triggerData: rule.trigger_data,
          conditions: safeParseJson(rule.conditions_json, []),
          actions: safeParseJson(rule.actions_json, []),
          cooldown: rule.cooldown_ms,
          runOnce: Boolean((rule as { run_once?: number }).run_once),
          createdAt: rule.created_at,
          updatedAt: rule.updated_at,
        }))
        console.log('[Automation] Listed', rules.length, 'rules')
        return { ok: true, data: rules }
      } catch (err) {
        console.error('[Automation] Error listing rules:', err)
        return { ok: false, error: { code: 'db_error', message: 'Failed to list rules: ' + (err instanceof Error ? err.message : String(err)) } }
      }
    }
    if (apiName === 'automation.rules.save') {
      try {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          return { ok: false, error: { code: 'invalid_args', message: 'payload object expected' } }
        }
        const p = payload as Record<string, unknown>
        const id = typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID()
        const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : undefined
        const trigger = typeof p.trigger === 'string' ? p.trigger : undefined
        if (!name || !trigger) {
          return { ok: false, error: { code: 'invalid_args', message: 'name and trigger are required' } }
        }
        if (!isAutomationTriggerTopic(trigger) && !isExtensionEventTopic(trigger)) {
          return {
            ok: false,
            error: {
              code: 'invalid_args',
              message: `trigger must be one of: ${AUTOMATION_TRIGGER_TOPICS.join(', ')} or start with 'extension.'`,
            },
          }
        }
        const conditions = Array.isArray(p.conditions) ? p.conditions : []
        const actions = Array.isArray(p.actions) ? p.actions : []
        const cooldown = typeof p.cooldown === 'number' && Number.isFinite(p.cooldown) ? Math.max(0, Math.floor(p.cooldown)) : 0
        const runOnce = typeof p.runOnce === 'boolean' ? p.runOnce : false
        const triggerData = typeof p.triggerData === 'string' ? p.triggerData : undefined
        saveAutomationRule(db, {
          id,
          name,
          enabled: p.enabled !== false,
          triggerTopic: trigger,
          triggerData,
          conditionsJson: JSON.stringify(conditions),
          actionsJson: JSON.stringify(actions),
          cooldownMs: cooldown,
          runOnce,
        })
        console.log('[Automation] Saved rule:', { id, name, trigger, runOnce, triggerData })
        return { ok: true, data: { id } }
      } catch (err) {
        console.error('[Automation] Error saving rule:', err)
        return { ok: false, error: { code: 'db_error', message: 'Failed to save rule: ' + (err instanceof Error ? err.message : String(err)) } }
      }
    }
    if (apiName === 'automation.rules.delete') {
      try {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
          return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
        }
        const ruleId = (payload as Record<string, string>).id
        const ok = deleteAutomationRule(db, ruleId)
        console.log('[Automation] Deleted rule:', { ruleId, ok })
        return ok ? { ok: true } : { ok: false, error: { code: 'not_found', message: 'rule not found' } }
      } catch (err) {
        console.error('[Automation] Error deleting rule:', err)
        return { ok: false, error: { code: 'db_error', message: 'Failed to delete rule: ' + (err instanceof Error ? err.message : String(err)) } }
      }
    }
    if (apiName === 'automation.runs.list') {
      try {
        const params = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
        const rows = listAutomationRuns(db, {
          ruleId: typeof params.ruleId === 'string' ? params.ruleId : undefined,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        console.log('[Automation] Listed', rows.length, 'runs')
        return {
          ok: true,
          data: rows.map((row) => ({
            id: row.id,
            ruleId: row.rule_id,
            eventTopic: row.event_topic,
            eventPayload: safeParseJson(row.event_payload_json, undefined),
            status: row.status,
            errorMessage: row.error_message,
            createdAt: row.created_at,
          })),
        }
      } catch (err) {
        console.error('[Automation] Error listing runs:', err)
        return { ok: false, error: { code: 'db_error', message: 'Failed to list runs: ' + (err instanceof Error ? err.message : String(err)) } }
      }
    }
    if (apiName === 'automation.schedule_task') {
      const params = asRecord(payload) ?? {}
      const instruction = typeof params.instruction === 'string' ? params.instruction.trim() : ''
      const name = typeof params.name === 'string' && params.name.trim()
        ? params.name.trim()
        : instruction.slice(0, 80) || 'Scheduled task'
      const triggerInput = typeof params.trigger === 'string' ? params.trigger.trim() : ''
      const trigger = isAutomationTriggerTopic(triggerInput) ? triggerInput : isExtensionEventTopic(triggerInput) ? triggerInput : parseTriggerDescription(triggerInput || instruction)
      
      // If trigger is 'cron', try to parse cron expression
      let cronExpression: string | undefined
      if (trigger === 'cron') {
        cronExpression = parseCronExpression(triggerInput) || (typeof params.cronExpression === 'string' ? params.cronExpression : undefined)
        if (!cronExpression) {
          // Try to infer from instruction if no explicit cron expression
          cronExpression = parseCronExpression(instruction) || undefined
        }
        if (!cronExpression) {
          return { ok: false, error: { code: 'invalid_args', message: 'Could not parse cron expression. Please provide a valid cron expression or natural language pattern like "every day at 9am".' } }
        }
        if (!isValidCronExpression(cronExpression)) {
          return { ok: false, error: { code: 'invalid_args', message: `Invalid cron expression: "${cronExpression}". Expected format: "minute hour day month dayOfWeek" (e.g., "0 9 * * *")` } }
        }
      }
      
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
        triggerData: cronExpression,
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
          ...(cronExpression && { cronExpression }),
        },
      }
    }
    if (apiName === 'automation.list_scheduled_tasks') {
      try {
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
            runOnce: Boolean((rule as { run_once?: number }).run_once),
            lastTriggeredAt: rule.last_triggered_at,
            actions: safeParseJson(rule.actions_json, []),
            updatedAt: rule.updated_at,
            ...(rule.trigger_topic === 'cron' && rule.trigger_data && { cronExpression: rule.trigger_data }),
          }))
        return { ok: true, data: rules }
      } catch (err) {
        console.error('[Automation] Error listing scheduled tasks:', err)
        return { ok: false, error: { code: 'db_error', message: 'Failed to list scheduled tasks: ' + (err instanceof Error ? err.message : String(err)) } }
      }
    }
    if (apiName === 'automation.delete_task') {
      const params = asRecord(payload) ?? {}
      const id = typeof params.id === 'string' && params.id.trim() ? params.id.trim() : undefined
      if (!id) {
        return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
      }
      const ok = deleteAutomationRule(db, id)
      if (!ok) {
        return { ok: false, error: { code: 'not_found', message: `Automation rule with id "${id}" not found` } }
      }
      return { ok: true, data: { deleted: true, id } }
    }
    if (apiName === 'automation.publish_extension_event') {
      const params = asRecord(payload) ?? {}
      const eventName = typeof params.eventName === 'string' && params.eventName.trim() ? params.eventName.trim() : undefined
      if (!eventName) {
        return { ok: false, error: { code: 'invalid_args', message: 'eventName is required' } }
      }
      const result = await publishExtensionAutomationEvent(BUILTIN_AUTOMATION_ID, eventName, params.payload ?? {})
      return result.ok ? { ok: true, data: { success: true } } : { ok: false, error: { code: 'internal', message: result.error || 'Failed to publish extension event' } }
    }
    return { ok: false, error: { code: 'not_found', message: 'API not found' } }
  }

  async function runExtensionsQueueWorkerCycle(queueConsume: (extensionId: string, topic: string, consumerId: string, opts?: { limit?: number }) => ExtensionHostCallResult, queueAck: (extensionId: string, messageId: string) => ExtensionHostCallResult, queueNack: (extensionId: string, messageId: string, retryAt?: string, errorMessage?: string) => ExtensionHostCallResult) {
    const topic = 'automation.events'
    const consume = queueConsume(BUILTIN_AUTOMATION_ID, topic, 'automation-worker', { limit: 20 })
    if (!consume.ok) return
    const messages = Array.isArray(consume.data) ? consume.data : []
    for (const message of messages) {
      const m = message as { id: string; topic?: string; payload?: unknown }
      try {
        // Handle both old format (payload with topic) and new format (topic at root level)
        let topicName = m.topic
        let eventPayload = m.payload
        
        if (!topicName && m.payload && typeof m.payload === 'object' && !Array.isArray(m.payload)) {
          const payload = m.payload as Record<string, unknown>
          topicName = typeof payload.topic === 'string' ? payload.topic : undefined
          eventPayload = payload.payload ?? payload
        }
        
        if (topicName) {
          await runAutomationOnEvent(BUILTIN_AUTOMATION_ID, topicName, eventPayload ?? {})
        }
        queueAck(BUILTIN_AUTOMATION_ID, m.id)
      } catch (error) {
        queueNack(BUILTIN_AUTOMATION_ID, m.id, undefined, error instanceof Error ? error.message : String(error))
      }
    }
  }

  async function publishExtensionAutomationEvent(extensionId: string, eventName: string, payload: unknown): Promise<{ ok: boolean; error?: string }> {
    // Validate the extension has the capability to publish events
    if (extensionId !== BUILTIN_AUTOMATION_ID) {
      // In a real implementation, you would check the extension's capabilities here
      // For now, we'll allow it for the built-in automation extension
      return { ok: false, error: 'Extension not authorized to publish automation events' }
    }

    // Validate event name format
    if (!/^[a-zA-Z0-9_-]+$/.test(eventName)) {
      return { ok: false, error: 'Event name can only contain letters, numbers, underscores and hyphens' }
    }

    const fullTopic = `extension.${eventName}`
    
    try {
      // Trigger automations that listen to this specific event or the generic 'extension.event' trigger
      await runAutomationOnEvent(extensionId, fullTopic, payload)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    runAutomationOnEvent,
    extensionsCallAutomation,
    runExtensionsQueueWorkerCycle,
    initializeCronTasks,
    updateCronTask,
    shutdownCronScheduler,
    publishExtensionAutomationEvent,
  }
}
