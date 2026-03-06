import type { ToolDefinition } from '@mariozechner/pi-coding-agent'

export type Capability =
  | 'ui.menu'
  | 'ui.mainView'
  | 'llm.tools'
  | 'events.subscribe'
  | 'events.publish'
  | 'queue.publish'
  | 'queue.consume'
  | 'storage.kv'
  | 'storage.files'
  | 'host.notifications'
  | 'host.conversations.read'
  | 'host.projects.read'
  | 'host.conversations.write'

export type HostEventTopic =
  | 'app.started'
  | 'conversation.created'
  | 'conversation.updated'
  | 'conversation.message.received'
  | 'conversation.agent.started'
  | 'conversation.agent.ended'
  | 'project.created'
  | 'project.deleted'
  | 'extension.installed'
  | 'extension.enabled'

export type ExtensionApiContract = {
  name: string
  version: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

export type ExtensionLlmToolManifest = {
  name: string
  label?: string
  description: string
  promptSnippet?: string
  promptGuidelines?: string[]
  parameters?: Record<string, unknown>
}

export type ExtensionManifest = {
  id: string
  name: string
  version: string
  kind?: 'channel'
  icon?: string
  entrypoints?: Record<string, string>
  ui?: {
    menuItems?: Array<{
      id: string
      label: string
      icon?: string
      location?: 'sidebar'
      order?: number
      badge?: string
      when?: string
      openMainView?: string
    }>
    mainViews?: Array<{
      viewId: string
      title: string
      icon?: string
      webviewUrl: string
      initialRoute?: string
    }>
    quickActions?: Array<{
      id: string
      title: string
      description?: string
      deeplink?: {
        viewId: string
        target: string
        params?: Record<string, unknown>
      }
    }>
  }
  capabilities: Capability[]
  hooks?: Partial<Record<'onInstall' | 'onEnable' | 'onDisable' | 'onUninstall' | 'onStart' | 'onStop' | 'onHealthCheck', string>>
  apis?: {
    exposes?: ExtensionApiContract[]
    consumes?: ExtensionApiContract[]
  }
  llm?: {
    tools?: ExtensionLlmToolManifest[]
  }
  server?: {
    start?: {
      command: string
      args?: string[]
      cwd?: string
      env?: Record<string, string>
      readyUrl?: string
      healthUrl?: string
      expectExit?: boolean
      startTimeoutMs?: number
      readyTimeoutMs?: number
    }
  }
  compat?: {
    minHostVersion?: string
    maxHostVersion?: string
  }
}

export type ExtensionHostCallResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: 'unauthorized' | 'invalid_args' | 'not_found' | 'rate_limited' | 'internal'; message: string } }

export type Subscription = {
  id: string
  extensionId: string
  topic: string
  options?: { projectId?: string; conversationId?: string }
}

export type ExtensionRuntimeState = {
  manifests: Map<string, ExtensionManifest>
  extensionRoots: Map<string, string>
  subscriptions: Map<string, Subscription>
  capabilityUsage: Map<string, Set<Capability>>
  serverProcesses: Map<string, import('node:child_process').ChildProcess>
  serverStatus: Map<
    string,
    {
      startedAt?: string
      pid?: number
      ready?: boolean
      lastError?: string
      lastExitAt?: string
      lastExitCode?: number | null
    }
  >
  started: boolean
}

export type ExposedExtensionToolDefinition = ToolDefinition & {
  extensionId: string
}
