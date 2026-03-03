import { BrowserWindow } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { findConversationById, saveConversationPiRuntime, type DbConversation } from './db/repos/conversations.js'
import { getDb } from './db/index.js'
import { findProjectById } from './db/repos/projects.js'

export type PiRuntimeStatus = 'stopped' | 'starting' | 'ready' | 'streaming' | 'error'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type ImageContent = {
  type: 'image'
  data: string
  mimeType: string
}

export type RpcExtensionUiRequest = {
  type: 'extension_ui_request'
  id: string
  method: 'select' | 'confirm' | 'input' | 'editor' | 'notify' | 'setStatus' | 'setWidget' | 'setTitle' | 'set_editor_text'
  [key: string]: JsonValue | undefined
}

export type RpcExtensionUiResponse =
  | { type: 'extension_ui_response'; id: string; value: string }
  | { type: 'extension_ui_response'; id: string; confirmed: boolean }
  | { type: 'extension_ui_response'; id: string; cancelled: true }

export type RpcCommand =
  | { id?: string; type: 'get_state' }
  | { id?: string; type: 'get_messages' }
  | { id?: string; type: 'get_available_models' }
  | { id?: string; type: 'get_commands' }
  | { id?: string; type: 'prompt'; message: string; images?: ImageContent[]; streamingBehavior?: 'steer' | 'followUp' }
  | { id?: string; type: 'steer'; message: string; images?: ImageContent[] }
  | { id?: string; type: 'follow_up'; message: string; images?: ImageContent[] }
  | { id?: string; type: 'abort' }
  | { id?: string; type: 'set_model'; provider: string; modelId: string }
  | { id?: string; type: 'set_thinking_level'; level: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' }
  | { id?: string; type: 'cycle_thinking_level' }
  | { id?: string; type: 'set_auto_compaction'; enabled: boolean }
  | { id?: string; type: 'set_auto_retry'; enabled: boolean }
  | { id?: string; type: 'set_steering_mode'; mode: 'all' | 'one-at-a-time' }
  | { id?: string; type: 'set_follow_up_mode'; mode: 'all' | 'one-at-a-time' }

export type RpcResponse = {
  id?: string
  type: 'response'
  command: string
  success: boolean
  data?: JsonValue
  error?: string
}

export type RpcEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages?: JsonValue[] }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message?: JsonValue; toolResults?: JsonValue[] }
  | { type: 'message_start'; message: JsonValue }
  | { type: 'message_update'; message: JsonValue; assistantMessageEvent?: JsonValue }
  | { type: 'message_end'; message: JsonValue }
  | { type: 'tool_execution_start'; toolCallId?: string; toolName?: string; args?: JsonValue }
  | { type: 'tool_execution_update'; toolCallId?: string; toolName?: string; partialResult?: JsonValue }
  | { type: 'tool_execution_end'; toolCallId?: string; toolName?: string; result?: JsonValue; isError?: boolean }
  | { type: 'auto_compaction_start'; reason?: string }
  | { type: 'auto_compaction_end'; result?: JsonValue; aborted?: boolean; willRetry?: boolean; errorMessage?: string }
  | { type: 'auto_retry_start'; attempt?: number; maxAttempts?: number; delayMs?: number; errorMessage?: string }
  | { type: 'auto_retry_end'; success?: boolean; attempt?: number; finalError?: string }
  | { type: 'extension_error'; extensionPath?: string; event?: string; error?: string }
  | RpcExtensionUiRequest

export type RpcSessionState = {
  model: { provider: string; id: string } | null
  thinkingLevel: string
  isStreaming: boolean
  isCompacting: boolean
  steeringMode: 'all' | 'one-at-a-time'
  followUpMode: 'all' | 'one-at-a-time'
  sessionFile: string
  sessionId: string
  sessionName?: string
  autoCompactionEnabled: boolean
  messageCount: number
  pendingMessageCount: number
}

export type PiProcessLifecycleEvent =
  | { type: 'runtime_status'; status: PiRuntimeStatus; message?: string }
  | { type: 'runtime_error'; message: string }

export type PiRendererEvent = {
  conversationId: string
  event: RpcEvent | RpcResponse | PiProcessLifecycleEvent
}

const COMMAND_TIMEOUT_MS = 45_000
const IDLE_STOP_MS = 120_000

class PiRpcProcess {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private stderrBuffer = ''
  private pending = new Map<string, { resolve: (response: RpcResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
  private status: PiRuntimeStatus = 'stopped'
  private commandSeq = 0
  private idleTimer: NodeJS.Timeout | null = null
  private snapshotState: RpcSessionState | null = null
  private snapshotMessages: JsonValue[] = []

  constructor(
    private readonly conversationId: string,
    private readonly onEvent: (payload: PiRendererEvent) => void,
  ) {}

  getStatus() {
    return this.status
  }

  getSnapshot() {
    return {
      state: this.snapshotState,
      messages: this.snapshotMessages,
      status: this.status,
    }
  }

  private emit(event: RpcEvent | RpcResponse | PiProcessLifecycleEvent) {
    this.onEvent({ conversationId: this.conversationId, event })
  }

  private setStatus(status: PiRuntimeStatus, message?: string) {
    this.status = status
    this.emit({ type: 'runtime_status', status, message })
  }

  private parseLine(line: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return
    }

    if (!parsed || typeof parsed !== 'object') {
      return
    }

    const asRecord = parsed as Record<string, unknown>
    if (asRecord.type === 'response') {
      const response = parsed as RpcResponse
      if (response.command === 'get_state' && response.success && response.data && typeof response.data === 'object') {
        this.snapshotState = response.data as unknown as RpcSessionState
      }
      if (response.command === 'get_messages' && response.success && response.data && typeof response.data === 'object') {
        const data = response.data as { messages?: JsonValue[] }
        this.snapshotMessages = Array.isArray(data.messages) ? data.messages : []
      }
      if (response.id && this.pending.has(response.id)) {
        const pending = this.pending.get(response.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pending.delete(response.id)
          pending.resolve(response)
        }
      }
      this.emit(response)
      return
    }

    const event = parsed as RpcEvent
    if (event.type === 'agent_start') {
      this.setStatus('streaming')
    }
    if (event.type === 'agent_end') {
      this.setStatus('ready')
      this.refreshSnapshot().catch(() => undefined)
      this.armIdleStopTimer()
    }
    if (event.type === 'extension_error') {
      this.setStatus('error', String((event as { error?: string }).error ?? 'Extension error'))
    }

    this.emit(event)
  }

  private armIdleStopTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }
    this.idleTimer = setTimeout(() => {
      void this.stop()
    }, IDLE_STOP_MS)
  }

  private clearIdleStopTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  private rejectPending(message: string) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error(message))
    }
    this.pending.clear()
  }

  async start(conversation: DbConversation) {
    if (this.proc) {
      return
    }

    const db = getDb()
    const project = findProjectById(db, conversation.project_id)
    if (!project) {
      this.setStatus('error', 'Project not found for conversation')
      throw new Error('Project not found for conversation')
    }

    const piPath = path.join(process.env.HOME ?? '', '.pi', 'agent', 'bin', 'pi')
    if (!piPath || !fs.existsSync(piPath)) {
      this.setStatus('error', 'Pi not available')
      throw new Error('Pi not available')
    }

    const sessionFile =
      conversation.pi_session_file && conversation.pi_session_file.trim().length > 0
        ? conversation.pi_session_file
        : path.join(process.env.HOME ?? '', '.pi', 'agent', 'sessions', 'chaton', `${conversation.id}.jsonl`)

    fs.mkdirSync(path.dirname(sessionFile), { recursive: true })

    const provider = conversation.model_provider ?? 'openai-codex'
    const modelId = conversation.model_id ?? 'gpt-5.3-codex'

    this.setStatus('starting')

    const child = spawn(piPath, ['--mode', 'rpc', '--session', sessionFile, '--model', `${provider}/${modelId}`], {
      cwd: project.repo_path,
      env: {
        ...process.env,
        TERM: 'dumb',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.proc = child

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk
      let idx = this.buffer.indexOf('\n')
      while (idx >= 0) {
        const line = this.buffer.slice(0, idx).trim()
        this.buffer = this.buffer.slice(idx + 1)
        if (line.length > 0) {
          this.parseLine(line)
        }
        idx = this.buffer.indexOf('\n')
      }
    })

    child.stderr.on('data', (chunk: string) => {
      this.stderrBuffer += chunk
      this.stderrBuffer = this.stderrBuffer.slice(-4096)
    })

    child.on('exit', (code, signal) => {
      const alreadyStopped = this.status === 'stopped'
      this.proc = null
      this.clearIdleStopTimer()
      if (!alreadyStopped) {
        const message = `Pi RPC exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
        this.setStatus('error', message)
        this.emit({ type: 'runtime_error', message })
      }
      this.rejectPending('Pi RPC process exited')
    })

    saveConversationPiRuntime(db, conversation.id, {
      piSessionFile: sessionFile,
      modelProvider: provider,
      modelId,
      thinkingLevel: conversation.thinking_level ?? 'medium',
    })

    try {
      await this.send({ type: 'get_state' })
      await this.send({ type: 'get_messages' })
      this.setStatus('ready')
      this.armIdleStopTimer()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setStatus('error', message)
      throw error
    }
  }

  async refreshSnapshot() {
    if (!this.proc) {
      return
    }
    await this.send({ type: 'get_state' })
    await this.send({ type: 'get_messages' })
  }

  async send(command: RpcCommand): Promise<RpcResponse> {
    if (!this.proc) {
      throw new Error('Pi session is not started')
    }

    this.clearIdleStopTimer()

    const id = command.id ?? `${Date.now()}-${++this.commandSeq}`
    const fullCommand = { ...command, id }

    const responsePromise = new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timeout waiting for response to ${command.type}`))
      }, COMMAND_TIMEOUT_MS)

      this.pending.set(id, {
        resolve,
        reject,
        timer,
      })
    })

    this.proc.stdin.write(`${JSON.stringify(fullCommand)}\n`, 'utf8')

    let response: RpcResponse
    try {
      response = await responsePromise
    } finally {
      this.armIdleStopTimer()
    }

    if (!response.success && response.error) {
      const db = getDb()
      saveConversationPiRuntime(db, this.conversationId, {
        lastRuntimeError: response.error,
      })
    }
    if (response.success && command.type === 'set_model') {
      const db = getDb()
      saveConversationPiRuntime(db, this.conversationId, {
        modelProvider: command.provider,
        modelId: command.modelId,
      })
    }
    if (response.success && command.type === 'set_thinking_level') {
      const db = getDb()
      saveConversationPiRuntime(db, this.conversationId, {
        thinkingLevel: command.level,
      })
    }

    return response
  }

  async respondExtensionUi(response: RpcExtensionUiResponse) {
    if (!this.proc) {
      return { ok: false as const, reason: 'not_started' }
    }

    this.proc.stdin.write(`${JSON.stringify(response)}\n`, 'utf8')
    return { ok: true as const }
  }

  async stop() {
    if (!this.proc) {
      this.setStatus('stopped')
      return
    }

    this.clearIdleStopTimer()

    try {
      await this.send({ type: 'abort' })
    } catch {
      // no-op
    }

    this.proc.kill('SIGTERM')
    this.proc = null
    this.rejectPending('Pi session stopped')
    this.setStatus('stopped')
  }
}

export class PiSessionRuntimeManager {
  private readonly runtimes = new Map<string, PiRpcProcess>()
  private readonly listeners = new Set<(event: PiRendererEvent) => void>()

  private broadcast(event: PiRendererEvent) {
    for (const listener of this.listeners) {
      listener(event)
    }

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('pi:event', event)
    }
  }

  subscribe(listener: (event: PiRendererEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private getOrCreateRuntime(conversationId: string) {
    let runtime = this.runtimes.get(conversationId)
    if (!runtime) {
      runtime = new PiRpcProcess(conversationId, (event) => this.broadcast(event))
      this.runtimes.set(conversationId, runtime)
    }
    return runtime
  }

  async start(conversationId: string) {
    const db = getDb()
    const conversation = findConversationById(db, conversationId)
    if (!conversation) {
      return { ok: false as const, reason: 'conversation_not_found', message: 'Conversation not found' }
    }

    const runtime = this.getOrCreateRuntime(conversationId)
    try {
      await runtime.start(conversation)
      return { ok: true as const }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      saveConversationPiRuntime(db, conversationId, { lastRuntimeError: message })
      return { ok: false as const, reason: 'start_failed', message }
    }
  }

  async stop(conversationId: string) {
    const runtime = this.runtimes.get(conversationId)
    if (!runtime) {
      return { ok: true as const }
    }

    await runtime.stop()
    this.runtimes.delete(conversationId)
    return { ok: true as const }
  }

  async sendCommand(conversationId: string, command: RpcCommand) {
    const started = await this.start(conversationId)
    if (!started.ok) {
      const startError = typeof started.message === 'string' ? started.message : 'Failed to start Pi session'
      return {
        type: 'response',
        command: command.type,
        success: false,
        error: startError,
      } as RpcResponse
    }

    const runtime = this.getOrCreateRuntime(conversationId)
    return runtime.send(command)
  }

  async getSnapshot(conversationId: string) {
    const runtime = this.getOrCreateRuntime(conversationId)
    const status = runtime.getStatus()
    if (status === 'stopped') {
      const started = await this.start(conversationId)
      if (!started.ok) {
        return {
          state: null,
          messages: [],
          status: 'error' as PiRuntimeStatus,
        }
      }
    }

    try {
      await runtime.refreshSnapshot()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (
        message.includes('Pi session stopped') ||
        message.includes('Pi RPC process exited') ||
        message.includes('Pi session is not started')
      ) {
        return {
          ...runtime.getSnapshot(),
          status: 'stopped' as PiRuntimeStatus,
        }
      }
      throw error
    }
    return runtime.getSnapshot()
  }

  async respondExtensionUi(conversationId: string, response: RpcExtensionUiResponse) {
    const runtime = this.runtimes.get(conversationId)
    if (!runtime) {
      return { ok: false as const, reason: 'not_started' }
    }
    return runtime.respondExtensionUi(response)
  }

  async stopAll() {
    const ids = Array.from(this.runtimes.keys())
    for (const id of ids) {
      await this.stop(id)
    }
  }
}
