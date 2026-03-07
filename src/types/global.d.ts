// src/types/global.d.ts
// Déclarations de types globaux pour l'application

import { PiModel, PiSettings } from "./pi-types";

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        once: (channel: string, listener: (...args: any[]) => void) => void;
        removeListener: (
          channel: string,
          listener: (...args: any[]) => void,
        ) => void;
        removeAllListeners: (channel: string) => void;
      };
    };
    chaton: {
      platform: string;
      pickProjectFolder: () => Promise<string | null>;
      importProjectFromFolder: (
        folderPath: string,
      ) => Promise<
        | { ok: true; duplicate: boolean; project: Project }
        | { ok: false; reason: "not_git_repo" | "unknown" }
      >;
      deleteProject: (projectId: string) => Promise<DeleteProjectResult>;
      getInitialState: () => Promise<WorkspacePayload>;
      getGitDiffSummary: (conversationId: string) => Promise<
        | {
            ok: true;
            files: Array<{ path: string; added: number; removed: number }>;
            totals: { files: number; added: number; removed: number };
          }
        | {
            ok: false;
            reason:
              | "project_not_found"
              | "not_git_repo"
              | "git_not_available"
              | "unknown";
            message?: string;
          }
      >;
      getGitFileDiff: (
        conversationId: string,
        filePath: string,
      ) => Promise<
        | {
            ok: true;
            path: string;
            diff: string;
            isBinary: boolean;
            firstChangedLine: number | null;
          }
        | {
            ok: false;
            reason:
              | "project_not_found"
              | "not_git_repo"
              | "git_not_available"
              | "file_not_found"
              | "unknown";
            message?: string;
          }
      >;
      getWorktreeGitInfo: (conversationId: string) => Promise<
        | {
            ok: true;
            worktreePath: string;
            branch: string;
            baseBranch: string;
            hasChanges: boolean;
            hasStagedChanges: boolean;
            hasUncommittedChanges: boolean;
            ahead: number;
            behind: number;
            isMergedIntoBase: boolean;
            isPushedToUpstream: boolean;
          }
        | {
            ok: false;
            reason:
              | "conversation_not_found"
              | "worktree_not_found"
              | "git_not_available"
              | "unknown";
            message?: string;
          }
      >;
      generateWorktreeCommitMessage: (conversationId: string) => Promise<
        | { ok: true; message: string }
        | {
            ok: false;
            reason:
              | "conversation_not_found"
              | "worktree_not_found"
              | "no_changes"
              | "git_not_available"
              | "unknown";
            message?: string;
          }
      >;
      commitWorktree: (
        conversationId: string,
        message: string,
      ) => Promise<
        | { ok: true; commit: string; message: string }
        | {
            ok: false;
            reason:
              | "conversation_not_found"
              | "worktree_not_found"
              | "empty_message"
              | "no_changes"
              | "git_not_available"
              | "unknown";
            message?: string;
          }
      >;
      mergeWorktreeIntoMain: (conversationId: string) => Promise<
        | { ok: true; merged: boolean; message: string }
        | {
            ok: false;
            reason:
              | "conversation_not_found"
              | "project_not_found"
              | "worktree_not_found"
              | "already_merged"
              | "merge_conflicts"
              | "git_not_available"
              | "unknown";
            message?: string;
          }
      >;
      pushWorktreeBranch: (conversationId: string) => Promise<
        | { ok: true; branch: string; remote: string }
        | {
            ok: false;
            reason:
              | "conversation_not_found"
              | "worktree_not_found"
              | "git_not_available"
              | "unknown";
            message?: string;
          }
      >;
      updateSettings: (settings: SidebarSettings) => Promise<SidebarSettings>;
      createConversationForProject: (
        projectId: string,
        options?: {
          modelProvider?: string;
          modelId?: string;
          thinkingLevel?: string;
          accessMode?: "secure" | "open";
        },
      ) => Promise<CreateConversationResult>;
      enableConversationWorktree: (conversationId: string) => Promise<
        | { ok: true; conversation: Conversation }
        | {
            ok: false;
            reason: "conversation_not_found" | "project_not_found" | "unknown";
          }
      >;
      disableConversationWorktree: (conversationId: string) => Promise<
        | { ok: true; changed: boolean }
        | {
            ok: false;
            reason:
              | "conversation_not_found"
              | "project_not_found"
              | "has_uncommitted_changes"
              | "unknown";
          }
      >;
      createConversationGlobal: (options?: {
        modelProvider?: string;
        modelId?: string;
        thinkingLevel?: string;
        accessMode?: "secure" | "open";
      }) => Promise<CreateConversationResult>;
      setConversationAccessMode: (
        conversationId: string,
        accessMode: "secure" | "open",
      ) => Promise<
        | { ok: true; accessMode: "secure" | "open" }
        | { ok: false; reason: "conversation_not_found" }
      >;
      deleteConversation: (
        conversationId: string,
        force?: boolean,
      ) => Promise<DeleteConversationResult>;
      getConversationMessageCache: (
        conversationId: string,
      ) => Promise<unknown[]>;
      requestConversationAutoTitle: (
        conversationId: string,
        firstMessage: string,
      ) => Promise<
        | { ok: true; skipped?: boolean; title?: string }
        | {
            ok: false;
            reason:
              | "empty_message"
              | "conversation_not_found"
              | "title_generation_failed";
          }
      >;
      listPiModels: () => Promise<
        | {
            ok: true;
            models: Array<{
              id: string;
              provider: string;
              scoped: boolean;
              key: string;
              supportsThinking: boolean;
              thinkingLevels: Array<
                "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
              >;
            }>;
          }
        | {
            ok: false;
            reason: "pi_not_available" | "unknown";
            message?: string;
          }
      >;
      syncPiModels: () => Promise<
        | {
            ok: true;
            models: Array<{
              id: string;
              provider: string;
              scoped: boolean;
              key: string;
              supportsThinking: boolean;
              thinkingLevels: Array<
                "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
              >;
            }>;
          }
        | {
            ok: false;
            reason: "pi_not_available" | "unknown";
            message?: string;
          }
      >;
      setPiModelScoped: (
        provider: string,
        id: string,
        scoped: boolean,
      ) => Promise<
        | {
            ok: true;
            models: Array<{
              id: string;
              provider: string;
              scoped: boolean;
              key: string;
              supportsThinking: boolean;
              thinkingLevels: Array<
                "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
              >;
            }>;
          }
        | {
            ok: false;
            reason: "pi_not_available" | "invalid_model" | "unknown";
            message?: string;
          }
      >;
      getPiConfigSnapshot: () => Promise<PiConfigSnapshot>;
      updatePiSettingsJson: (
        next: Record<string, unknown>,
      ) => Promise<{ ok: true } | { ok: false; message: string }>;
      resolveProviderBaseUrl: (
        rawUrl: string,
      ) => Promise<
        | { ok: true; baseUrl: string; matched: boolean; tested: string[] }
        | { ok: false; message: string }
      >;
      updatePiModelsJson: (
        next: Record<string, unknown>,
      ) => Promise<{ ok: true } | { ok: false; message: string }>;
      updatePiAuthJson: (
        next: Record<string, unknown>,
      ) => Promise<{ ok: true } | { ok: false; message: string }>;
      runPiCommand: (
        action: PiCommandAction,
        params?: { search?: string; source?: string; local?: boolean },
      ) => Promise<PiCommandResult>;
      getPiDiagnostics: () => Promise<PiDiagnostics>;
      getPiAuthJson: () => Promise<{ ok: true; auth: Record<string, unknown> }>;
      oauthLogin: (
        providerId: string,
      ) => Promise<
        { ok: true; providerId: string } | { ok: false; message: string }
      >;
      oauthPromptReply: (value: string) => void;
      oauthPromptCancel: () => void;
      oauthLoginCancel: () => void;
      onOAuthEvent: (
        callback: (event: {
          type: string;
          url?: string;
          instructions?: string;
          message?: string;
          placeholder?: string;
          allowEmpty?: boolean;
        }) => void,
      ) => () => void;
      listSkillsCatalog: () => Promise<{
        ok: true;
        entries: Array<{
          source: string;
          title: string;
          description: string;
          author?: string;
          installs?: number;
          stars?: number;
          highlighted?: boolean;
        }>;
        source: "remote" | "cache";
        updatedAt: string;
      }>;
      getSkillsMarketplace: () => Promise<{
        ok: boolean;
        featured?: Array<{
          source: string;
          title: string;
          description: string;
          author?: string;
          installs?: number;
          stars?: number;
          highlighted?: boolean;
          category?: string;
          tags?: string[];
          language?: string;
          lastUpdated?: string;
          featured?: boolean;
          popularity?: string;
        }>;
        new?: Array<{
          source: string;
          title: string;
          description: string;
          author?: string;
          installs?: number;
          stars?: number;
          highlighted?: boolean;
          category?: string;
          tags?: string[];
          language?: string;
          lastUpdated?: string;
          featured?: boolean;
          popularity?: string;
        }>;
        trending?: Array<{
          source: string;
          title: string;
          description: string;
          author?: string;
          installs?: number;
          stars?: number;
          highlighted?: boolean;
          category?: string;
          tags?: string[];
          language?: string;
          lastUpdated?: string;
          featured?: boolean;
          popularity?: string;
        }>;
        byCategory?: Array<{
          name: string;
          count: number;
          items: Array<{
            source: string;
            title: string;
            description: string;
            author?: string;
            installs?: number;
            stars?: number;
            highlighted?: boolean;
            category?: string;
            tags?: string[];
            language?: string;
            lastUpdated?: string;
            featured?: boolean;
            popularity?: string;
          }>;
        }>;
        updatedAt?: string;
        source?: "remote" | "cache";
        message?: string;
      }>;
      getSkillsMarketplaceFiltered: (options: {
        query?: string;
        category?: string;
        language?: string;
        minInstalls?: number;
        minStars?: number;
        source?: string;
        createdAfter?: string;
        updatedAfter?: string;
        sortBy?: string;
        limit?: number;
      }) => Promise<{
        ok: boolean;
        results?: Array<{
          source: string;
          title: string;
          description: string;
          author?: string;
          installs?: number;
          stars?: number;
          highlighted?: boolean;
          category?: string;
          tags?: string[];
          language?: string;
          lastUpdated?: string;
          featured?: boolean;
          popularity?: string;
        }>;
        total?: number;
        returned?: number;
        message?: string;
      }>;
      getSkillsRatings: (skillSource?: string) => Promise<any[]>;
      addSkillRating: (
        skillSource: string,
        rating: number,
        review?: string,
      ) => Promise<any>;
      getSkillAverageRating: (
        skillSource: string,
      ) => Promise<{ average: number; count: number }>;
      listExtensions: () => Promise<{
        ok: true;
        extensions: ChatonsExtension[];
      }>;
      listExtensionCatalog: () => Promise<{
        ok: true;
        entries: ChatonsExtensionCatalogItem[];
        updatedAt: string;
        source: "cache" | "npm";
      }>;
      getExtensionMarketplace: () => Promise<{
        ok: boolean;
        featured?: ChatonsExtensionCatalogItem[];
        new?: ChatonsExtensionCatalogItem[];
        trending?: ChatonsExtensionCatalogItem[];
        byCategory?: Array<{
          name: string;
          count: number;
          items: ChatonsExtensionCatalogItem[];
        }>;
        updatedAt?: string;
        source?: "cache" | "npm";
        message?: string;
      }>;
      publishExtension: (
        id: string,
        npmToken?: string,
      ) => Promise<{
        ok: boolean;
        started?: boolean;
        state?: { id: string; status: string; message?: string } | null;
        message?: string;
        requiresNpmLogin?: boolean;
        npmLoginHelp?: string;
      }>;
      checkStoredNpmToken: () => Promise<{
        ok: boolean;
        hasToken: boolean;
      }>;
      clearStoredNpmToken: () => Promise<{
        ok: boolean;
        message?: string;
      }>;
      quickActionsListUsage: () => Promise<{
        ok: true;
        rows: Array<{
          action_id: string;
          uses_count: number;
          decayed_score: number;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
        }>;
      }>;
      quickActionsRecordUse: (actionId: string) => Promise<
        | {
            ok: true;
            row: {
              action_id: string;
              uses_count: number;
              decayed_score: number;
              last_used_at: string | null;
              created_at: string;
              updated_at: string;
            };
          }
        | { ok: false; message: string }
      >;
      getExtensionManifest: (
        id: string,
      ) => Promise<{ ok: true; manifest: unknown | null }>;
      registerExtensionUi: () => Promise<{ ok: true; entries: unknown[] }>;
      getExtensionMainViewHtml: (
        viewId: string,
      ) => Promise<{ ok: boolean; html?: string; message?: string }>;
      installExtension: (id: string) => Promise<{
        ok: boolean;
        message?: string;
        extension?: ChatonsExtension;
        started?: boolean;
        state?: {
          id: string;
          status: string;
          message?: string;
          startedAt?: string;
          finishedAt?: string;
        } | null;
      }>;
      getExtensionInstallState: (id: string) => Promise<{
        ok: boolean;
        state?: {
          id: string;
          status: string;
          message?: string;
          startedAt?: string;
          finishedAt?: string;
        };
      }>;
      cancelExtensionInstall: (
        id: string,
      ) => Promise<{ ok: boolean; message?: string }>;
      toggleExtension: (
        id: string,
        enabled: boolean,
      ) => Promise<{
        ok: boolean;
        id?: string;
        enabled?: boolean;
        message?: string;
      }>;
      removeExtension: (
        id: string,
      ) => Promise<{ ok: boolean; id?: string; message?: string }>;
      runExtensionHealthCheck: () => Promise<{
        ok: true;
        report: Array<{
          id: string;
          enabled: boolean;
          health: string;
          lastRunStatus: string | null;
          lastError: string | null;
        }>;
      }>;
      getExtensionLogs: (
        id: string,
      ) => Promise<{ ok: true; id: string; content: string }>;
      extensionEventSubscribe: (
        extensionId: string,
        topic: string,
        options?: { projectId?: string; conversationId?: string },
      ) => Promise<{ ok: boolean; subscriptionId?: string; message?: string }>;
      extensionEventPublish: (
        extensionId: string,
        topic: string,
        payload: unknown,
        meta?: { idempotencyKey?: string },
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionQueueEnqueue: (
        extensionId: string,
        topic: string,
        payload: unknown,
        opts?: { idempotencyKey?: string; availableAt?: string },
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionQueueConsume: (
        extensionId: string,
        topic: string,
        consumerId: string,
        opts?: { limit?: number },
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionQueueAck: (
        extensionId: string,
        messageId: string,
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionQueueNack: (
        extensionId: string,
        messageId: string,
        retryAt?: string,
        errorMessage?: string,
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionQueueDeadLetterList: (
        extensionId: string,
        topic?: string,
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionStorageKvGet: (
        extensionId: string,
        key: string,
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionStorageKvSet: (
        extensionId: string,
        key: string,
        value: unknown,
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionStorageKvDelete: (
        extensionId: string,
        key: string,
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionStorageKvList: (extensionId: string) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionStorageFilesRead: (
        extensionId: string,
        relativePath: string,
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionStorageFilesWrite: (
        extensionId: string,
        relativePath: string,
        content: string,
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionHostCall: (
        extensionId: string,
        method: string,
        params?: Record<string, unknown>,
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionCall: (
        callerExtensionId: string,
        extensionId: string,
        apiName: string,
        versionRange: string,
        payload: unknown,
      ) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      }>;
      extensionRuntimeHealth: () => Promise<{
        ok: true;
        started: boolean;
        manifests: number;
        subscriptions: number;
        deadLetters: number;
        byExtension: unknown[];
      }>;
      restartAppForExtension: () => Promise<{ ok: true }>;
      openExtensionsFolder: () => Promise<{ ok: boolean; message?: string }>;
      checkExtensionUpdates: () => Promise<{
        ok: true;
        updates: Array<{
          id: string;
          currentVersion: string;
          latestVersion: string;
        }>;
      }>;
      updateExtension: (id: string) => Promise<{
        ok: boolean;
        started?: boolean;
        state?: { id: string; status: string; message?: string } | null;
        message?: string;
      }>;
      updateAllExtensions: () => Promise<{
        ok: true;
        results: Array<{ id: string; success: boolean; message: string }>;
      }>;
      openPath: (
        target: "settings" | "models" | "sessions",
      ) => Promise<{ ok: boolean; message?: string }>;
      exportPiSessionHtml: (
        sessionFile: string,
        outputFile?: string,
      ) => Promise<PiCommandResult>;
      piStartSession: (
        conversationId: string,
      ) => Promise<
        { ok: true } | { ok: false; reason: string; message?: string }
      >;
      piStopSession: (conversationId: string) => Promise<{ ok: true }>;
      piSendCommand: (
        conversationId: string,
        command: RpcCommand,
      ) => Promise<RpcResponse>;
      piGetSnapshot: (
        conversationId: string,
      ) => Promise<{ state: unknown; messages: unknown[]; status: string }>;
      piRespondExtensionUi: (
        conversationId: string,
        response: RpcExtensionUiResponse,
      ) => Promise<{ ok: true } | { ok: false; reason: string }>;
      clearThreadActionSuggestions: (conversationId: string) => void;
      onPiEvent: (listener: (event: PiRendererEvent) => void) => () => void;
      onConversationUpdated: (
        listener: (payload: {
          conversationId: string;
          title?: string;
          worktreePath?: string;
          updatedAt: string;
        }) => void,
      ) => () => void;
      onExtensionOpenMainView: (
        listener: (payload: { extensionId: string; viewId: string }) => void,
      ) => () => void;
      onExtensionNotification: (
        listener: (payload: { title: string; body: string }) => void,
      ) => () => void;
      getLanguagePreference: () => Promise<string>;
      updateLanguagePreference: (language: string) => Promise<void>;
      detectVscode: () => Promise<{ detected: boolean }>;
      detectOllama: () => Promise<{
        installed: boolean;
        apiRunning: boolean;
        baseUrl: string;
      }>;
      detectLmStudio: () => Promise<{
        installed: boolean;
        apiRunning: boolean;
        baseUrl: string;
      }>;
      openWorktreeInVscode: (
        worktreePath: string,
      ) => Promise<{ success: boolean; error?: string }>;
      openProjectFolder: (
        projectId: string,
      ) => Promise<
        | { ok: true }
        | { ok: false; reason: "project_not_found"; message?: string }
      >;
      detectProjectCommands: (conversationId: string) => Promise<
        | {
            ok: true;
            projectType: string;
            commands: Array<{
              id: string;
              label: string;
              command: string;
              args: string[];
              source: string;
              cwd?: string;
            }>;
            customCommands: Array<{
              id: string;
              commandText: string;
              lastUsedAt: string;
            }>;
          }
        | {
            ok: false;
            reason: "conversation_not_found" | "project_not_found" | "unknown";
            message?: string;
          }
      >;
      startProjectCommandTerminal: (
        conversationId: string,
        commandId: string,
        customCommandText?: string,
      ) => Promise<
        | {
            ok: true;
            runId: string;
            startedAt: string;
          }
        | {
            ok: false;
            reason:
              | "conversation_not_found"
              | "project_not_found"
              | "command_not_found"
              | "already_running"
              | "access_denied"
              | "unknown";
            message?: string;
          }
      >;
      readProjectCommandTerminal: (
        runId: string,
        afterSeq?: number,
      ) => Promise<
        | {
            ok: true;
            run: {
              id: string;
              title: string;
              commandLabel: string;
              commandPreview: string;
              status: "running" | "exited" | "failed" | "stopped";
              exitCode: number | null;
              startedAt: string;
              endedAt: string | null;
            };
            events: Array<{
              seq: number;
              stream: "stdout" | "stderr" | "meta";
              text: string;
            }>;
          }
        | { ok: false; reason: "run_not_found" }
      >;
      stopProjectCommandTerminal: (
        runId: string,
      ) => Promise<{ ok: true } | { ok: false; reason: "run_not_found" }>;
    };
    pi: {
      getModels: () => Promise<PiModel[]>;
      getSettings: () => Promise<PiSettings>;
      updateSettings: (newSettings: Partial<PiSettings>) => Promise<PiSettings>;
      isUsingUserConfig: () => Promise<boolean>;
    };
    logger: {
      getLogs: (limit?: number) => Promise<
        Array<{
          timestamp: string;
          source: "electron" | "pi" | "frontend";
          level: "info" | "warn" | "error" | "debug";
          message: string;
          data?: any;
        }>
      >;
      clearLogs: () => Promise<boolean>;
      getLogFilePath: () => Promise<string>;
      log: (
        level: "info" | "warn" | "error" | "debug",
        message: string,
        data?: any,
      ) => void;
    };
    telemetry: {
      log: (
        level: "info" | "warn" | "error" | "debug",
        message: string,
        data?: unknown,
      ) => Promise<boolean>;
      crash: (payload: {
        message: string;
        stack?: string;
        context?: unknown;
      }) => Promise<boolean>;
    };
  }
}

export {};
