import type {
  CreateConversationResult,
  DeleteConversationResult,
  DeleteProjectResult,
  PiCommandAction,
  PiCommandResult,
  PiConfigSnapshot,
  PiDiagnostics,
  ChatonExtension,
  Project,
  SidebarSettings,
  WorkspacePayload,
} from '@/features/workspace/types'
import type { PiRendererEvent, RpcCommand, RpcExtensionUiResponse, RpcResponse } from '@/features/workspace/rpc'

declare global {
  interface Window {
    chaton: {
      platform: string
      pickProjectFolder: () => Promise<string | null>
      importProjectFromFolder: (
        folderPath: string,
      ) => Promise<{ ok: true; duplicate: boolean; project: Project } | { ok: false; reason: 'not_git_repo' | 'unknown' }>
      deleteProject: (projectId: string) => Promise<DeleteProjectResult>
      getInitialState: () => Promise<WorkspacePayload>
      getGitDiffSummary: (
        conversationId: string,
      ) => Promise<
        | {
            ok: true
            files: Array<{ path: string; added: number; removed: number }>
            totals: { files: number; added: number; removed: number }
          }
        | { ok: false; reason: 'project_not_found' | 'not_git_repo' | 'git_not_available' | 'unknown'; message?: string }
      >
      getGitFileDiff: (
        conversationId: string,
        filePath: string,
      ) => Promise<
        | { ok: true; path: string; diff: string; isBinary: boolean; firstChangedLine: number | null }
        | {
            ok: false
            reason: 'project_not_found' | 'not_git_repo' | 'git_not_available' | 'file_not_found' | 'unknown'
            message?: string
          }
      >
      updateSettings: (settings: SidebarSettings) => Promise<SidebarSettings>
      createConversationForProject: (
        projectId: string,
        options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string },
      ) => Promise<CreateConversationResult>
      deleteConversation: (conversationId: string) => Promise<DeleteConversationResult>
      getConversationMessageCache: (conversationId: string) => Promise<unknown[]>
      requestConversationAutoTitle: (
        conversationId: string,
        firstMessage: string,
      ) => Promise<
        | { ok: true; skipped?: boolean; title?: string }
        | {
            ok: false
            reason: 'empty_message' | 'conversation_not_found' | 'project_not_found' | 'title_generation_failed'
          }
      >
      listPiModels: () => Promise<
        | {
            ok: true
            models: Array<{
              id: string
              provider: string
              scoped: boolean
              key: string
              supportsThinking: boolean
              thinkingLevels: Array<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'>
            }>
          }
        | { ok: false; reason: 'pi_not_available' | 'unknown'; message?: string }
      >
      syncPiModels: () => Promise<
        | {
            ok: true
            models: Array<{
              id: string
              provider: string
              scoped: boolean
              key: string
              supportsThinking: boolean
              thinkingLevels: Array<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'>
            }>
          }
        | { ok: false; reason: 'pi_not_available' | 'unknown'; message?: string }
      >
      setPiModelScoped: (
        provider: string,
        id: string,
        scoped: boolean,
      ) => Promise<
        | {
            ok: true
            models: Array<{
              id: string
              provider: string
              scoped: boolean
              key: string
              supportsThinking: boolean
              thinkingLevels: Array<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'>
            }>
          }
        | { ok: false; reason: 'pi_not_available' | 'invalid_model' | 'unknown'; message?: string }
      >
      getPiConfigSnapshot: () => Promise<PiConfigSnapshot>
      updatePiSettingsJson: (next: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; message: string }>
      updatePiModelsJson: (next: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; message: string }>
      runPiCommand: (action: PiCommandAction, params?: { search?: string; source?: string; local?: boolean }) => Promise<PiCommandResult>
      getPiDiagnostics: () => Promise<PiDiagnostics>
      listExtensions: () => Promise<{ ok: true; extensions: ChatonExtension[] }>
      installExtension: (id: string) => Promise<{ ok: boolean; message?: string; extension?: ChatonExtension }>
      toggleExtension: (id: string, enabled: boolean) => Promise<{ ok: boolean; id?: string; enabled?: boolean; message?: string }>
      removeExtension: (id: string) => Promise<{ ok: boolean; id?: string; message?: string }>
      runExtensionHealthCheck: () => Promise<{ ok: true; report: Array<{ id: string; enabled: boolean; health: string; lastRunStatus: string | null; lastError: string | null }> }>
      getExtensionLogs: (id: string) => Promise<{ ok: true; id: string; content: string }>
      openPath: (target: 'settings' | 'models' | 'sessions') => Promise<{ ok: boolean; message?: string }>
      exportPiSessionHtml: (sessionFile: string, outputFile?: string) => Promise<PiCommandResult>
      piStartSession: (conversationId: string) => Promise<{ ok: true } | { ok: false; reason: string; message?: string }>
      piStopSession: (conversationId: string) => Promise<{ ok: true }>
      piSendCommand: (conversationId: string, command: RpcCommand) => Promise<RpcResponse>
      piGetSnapshot: (conversationId: string) => Promise<{ state: unknown; messages: unknown[]; status: string }>
      piRespondExtensionUi: (
        conversationId: string,
        response: RpcExtensionUiResponse,
      ) => Promise<{ ok: true } | { ok: false; reason: string }>
      onPiEvent: (listener: (event: PiRendererEvent) => void) => () => void
      onConversationUpdated: (
        listener: (payload: { conversationId: string; title: string; updatedAt: string }) => void,
      ) => () => void
      getLanguagePreference: () => Promise<string>
      updateLanguagePreference: (language: string) => Promise<void>
    }
  }
}

export {}
