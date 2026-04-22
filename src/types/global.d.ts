// src/types/global.d.ts
// Déclarations de types globaux pour l'application

import { PiModel, PiSettings } from "./pi-types";
import type { AcpConversationState } from "@/features/workspace/types";

declare global {
  interface SpeechRecognitionResultLike {
    transcript: string;
  }

  interface SpeechRecognitionResultListLike {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [resultIndex: number]: SpeechRecognitionResultLike;
    };
  }

  interface SpeechRecognitionEvent {
    resultIndex: number;
    results: SpeechRecognitionResultListLike;
  }

  interface SpeechRecognitionErrorEvent {
    error: string;
  }

  interface SpeechRecognitionInstance {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onstart: (() => void) | null;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onend: (() => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    start: () => void;
    stop: () => void;
  }

  interface SpeechRecognitionConstructor {
    new (): SpeechRecognitionInstance;
  }

  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
        send: (channel: string, ...args: unknown[]) => void;
        on: (channel: string, listener: (...args: unknown[]) => void) => void;
        once: (channel: string, listener: (...args: unknown[]) => void) => void;
        removeListener: (
          channel: string,
          listener: (...args: unknown[]) => void,
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
      connectCloudInstance: (input: {
        name?: string
        baseUrl?: string
      }) => Promise<
        | { ok: true; duplicate: boolean; id: string }
        | { ok: false; reason: "invalid_base_url"; message?: string }
      >;
      startCloudAuth: (input?: {
        name?: string
        baseUrl?: string
      }) => Promise<
        | { ok: true; instanceId: string; authUrl: string }
        | { ok: false; reason: "invalid_base_url" | "open_failed"; message?: string }
      >;
      completeCloudAuth: (payload: {
        code?: string | null
        state?: string | null
        error?: string | null
        baseUrl?: string | null
      }) => Promise<
        | { ok: true; instanceId: string; duplicate?: boolean }
        | { ok: false; reason: "invalid_state" | "provider_error" | "unknown"; message?: string }
      >;
      updateCloudInstanceStatus: (
        instanceId: string,
        status: "connected" | "connecting" | "disconnected" | "error",
        lastError?: string | null,
      ) => Promise<
        | { ok: true }
        | { ok: false; reason: "instance_not_found" }
      >;
      createCloudProject: (params: {
        cloudInstanceId: string
        name: string
        organizationId: string
        kind: "repository" | "conversation_only"
        repository?: {
          cloneUrl: string
          defaultBranch: string | null
          authMode: "none" | "token"
          accessToken: string | null
        } | null
      }) => Promise<
        | { ok: true; project: Project }
        | {
            ok: false
            reason:
              | "cloud_instance_not_found"
              | "invalid_name"
              | "unknown"
            message?: string
          }
      >;
      getCloudAccount: () => Promise<
        | { ok: true; account: import('@/features/workspace/types').CloudAccount | null; users: import('@/features/workspace/types').CloudAccountUser[] }
        | { ok: false; reason: "not_connected" | "session_expired" | "forbidden" | "unknown"; message?: string }
      >;
      logoutCloud: () => Promise<{ ok: true } | { ok: false; reason: "not_connected" }>;
      updateCloudUser: (
        userId: string,
        updates: { subscriptionPlan?: import('@/features/workspace/types').CloudSubscriptionPlan; isAdmin?: boolean },
      ) => Promise<
        | { ok: true; account: import('@/features/workspace/types').CloudAccount | null; users: import('@/features/workspace/types').CloudAccountUser[] }
        | { ok: false; reason: "not_connected" | "forbidden" | "unknown"; message?: string }
      >;
      grantCloudSubscription: (
        userId: string,
        grant: { planId: import('@/features/workspace/types').CloudSubscriptionPlan; durationDays?: number | null },
      ) => Promise<
        | { ok: true; account: import('@/features/workspace/types').CloudAccount | null; users: import('@/features/workspace/types').CloudAccountUser[] }
        | { ok: false; reason: "not_connected" | "forbidden" | "unknown"; message?: string }
      >;
      updateCloudPlan: (
        planId: import('@/features/workspace/types').CloudSubscriptionPlan,
        updates: { label?: string; parallelSessionsLimit?: number; isDefault?: boolean },
      ) => Promise<
        | { ok: true; account: import('@/features/workspace/types').CloudAccount | null; users: import('@/features/workspace/types').CloudAccountUser[] }
        | { ok: false; reason: "not_connected" | "forbidden" | "unknown"; message?: string }
      >;
      onCloudAuthCallback: (
        listener: (payload: {
          code?: string | null
          state?: string | null
          error?: string | null
          baseUrl?: string | null
          rawUrl: string
        }) => void,
      ) => () => void;
      onCloudConnect: (
        listener: (payload: {
          baseUrl?: string | null
          rawUrl: string
        }) => void,
      ) => () => void;
      onCloudRealtimeEvent: (
        listener: (payload: {
          instanceId?: string
          type?: string
          conversationId?: string
          status?: "connected" | "connecting" | "disconnected" | "error"
          message?: string
          payload?: unknown
        }) => void,
      ) => () => void;
      deleteProject: (projectId: string) => Promise<DeleteProjectResult>;
      archiveProject: (projectId: string, isArchived: boolean) => Promise<{ ok: boolean; reason?: string }>;
      setProjectHidden: (projectId: string, isHidden: boolean) => Promise<{ ok: boolean; reason?: string }>;
      updateProjectIcon: (projectId: string, icon: string | null) => Promise<{ ok: boolean; reason?: string }>;
      scanProjectImages: (projectId: string) => Promise<{ ok: boolean; reason?: string; images: string[] }>;
      pickIconImage: () => Promise<string | null>;
      imageToDataUrl: (imagePath: string) => Promise<string | null>;
      getInitialState: () => Promise<WorkspacePayload>;
      getConversationAcpState: (conversationId: string) => Promise<
        | { ok: true; state: AcpConversationState }
        | { ok: false; reason: "conversation_not_found" }
      >;
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
      searchProjectFiles: (
        query: string,
        conversationId: string | null,
        projectId: string | null,
      ) => Promise<
        | { ok: true; files: string[] }
        | { ok: false; reason: string }
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
      getTouchedFilesForToolCall: (toolCallId: string) => Promise<string[]>;
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
            nativeGitAvailable?: boolean;
            changes: Array<{
              path: string;
              x: string;
              y: string;
              staged: boolean;
              unstaged: boolean;
              untracked: boolean;
              deleted: boolean;
              renamed: boolean;
            }>;
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
      stageWorktreeFile: (
        conversationId: string,
        filePath: string,
      ) => Promise<
        | { ok: true }
        | {
            ok: false;
            reason:
              | "conversation_not_found"
              | "worktree_not_found"
              | "file_not_found"
              | "git_not_available"
              | "unknown";
            message?: string;
          }
      >;
      unstageWorktreeFile: (
        conversationId: string,
        filePath: string,
      ) => Promise<
        | { ok: true }
        | {
            ok: false;
            reason:
              | "conversation_not_found"
              | "worktree_not_found"
              | "file_not_found"
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
      pullWorktreeBranch: (conversationId: string) => Promise<
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
      getConversationHarnessFeedback: (conversationId: string) => Promise<{
        ok: true;
        feedback: {
          conversationId: string;
          harnessCandidateId: string | null;
          harnessSnapshot: Record<string, unknown> | null;
          enabled: boolean;
          userRating: -1 | 1 | null;
          userFeedbackSubmittedAt: string | null;
          createdAt: string;
          updatedAt: string;
        } | null;
      } | {
        ok: false;
        reason: "conversation_not_found";
      }>;
      setConversationHarnessFeedback: (
        conversationId: string,
        input: {
          enabled?: boolean;
          userRating?: -1 | 1 | null;
        },
      ) => Promise<{
        ok: true;
        feedback: {
          conversationId: string;
          harnessCandidateId: string | null;
          harnessSnapshot: Record<string, unknown> | null;
          enabled: boolean;
          userRating: -1 | 1 | null;
          userFeedbackSubmittedAt: string | null;
          createdAt: string;
          updatedAt: string;
        };
      } | {
        ok: false;
        reason: "conversation_not_found";
      }>;
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
        | { ok: false; reason: "conversation_not_found" | "restart_failed"; message?: string }
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
      discoverProviderModels: (
        providerConfig: Record<string, unknown>,
        providerId?: string,
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
            models?: Array<{
              id: string;
              provider: string;
              scoped: boolean;
              key: string;
              supportsThinking: boolean;
              thinkingLevels: Array<
                "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
              >;
            }>;
            message?: string;
          }
      >;
      testProviderConnection: (
        providerConfig: Record<string, unknown>,
      ) => Promise<
        | {
            ok: true;
            latency: number;
            statusCode: number;
            message: string;
          }
        | {
            ok: false;
            message: string;
            statusCode?: number;
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
        source: "remote" | "cache" | "fallback" | "skills.sh" | "cloudhub" | "npm-pi" | "hybrid";
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
          installSource?: string;
          packageName?: string;
          packageVersion?: string;
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
          installSource?: string;
          packageName?: string;
          packageVersion?: string;
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
          installSource?: string;
          packageName?: string;
          packageVersion?: string;
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
            installSource?: string;
            packageName?: string;
            packageVersion?: string;
          }>;
        }>;
        updatedAt?: string;
        source?: "remote" | "cache" | "fallback" | "skills.sh" | "cloudhub" | "npm-pi" | "hybrid";
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
          installSource?: string;
          packageName?: string;
          packageVersion?: string;
        }>;
        total?: number;
        returned?: number;
        message?: string;
      }>;
      getSkillsRatings: (skillSource?: string) => Promise<unknown[]>;
      addSkillRating: (
        skillSource: string,
        rating: number,
        review?: string,
      ) => Promise<unknown>;
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
        source: "cache" | "npm" | "chatons";
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
        source?: "cache" | "npm" | "chatons";
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
      ) => Promise<{ ok: boolean; html?: string; baseUrl?: string; message?: string }>;
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
      onAcpEvent: (
        listener: (payload: {
          conversationId: string;
          state: AcpConversationState;
          latest: AcpConversationState["timeline"][number];
        }) => void,
      ) => () => void;
      onConversationUpdated: (
        listener: (payload: {
          conversationId: string;
          title?: string;
          worktreePath?: string;
          accessMode?: 'secure' | 'open';
          updatedAt: string;
        }) => void,
      ) => () => void;
      onExtensionOpenMainView: (
        listener: (payload: { extensionId: string; viewId: string }) => void,
      ) => () => void;
      onExtensionNotification: (
        listener: (payload: {
          title: string;
          body: string;
          link?: { type: "deeplink" | "url"; href: string; label?: string };
          meta?: unknown;
        }) => void,
      ) => () => void;
      onExtensionEvent: (
        listener: (payload: {
          topic: string;
          payload: unknown;
          publishedAt: string;
          subscribedExtensionIds: string[];
        }) => void,
      ) => () => void;
      onDeeplinkExtensionInstall: (
        listener: (payload: { extensionId: string }) => void,
      ) => () => void;
      getLanguagePreference: () => Promise<string>;
      updateLanguagePreference: (language: string) => Promise<void>;
      detectVscode: () => Promise<{ detected: boolean }>;
      detectExternalCommand: (command: string) => Promise<{ detected: boolean }>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      openExternalApplication: (
        command: string,
        args: string[],
      ) => Promise<{ success: boolean; error?: string }>;
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
      // Composer drafts
      saveDraft: (
        key: string,
        content: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      getDraft: (
        key: string,
      ) => Promise<{ ok: boolean; draft: string | null; error?: string }>;
      getAllDrafts: () => Promise<{
        ok: boolean;
        drafts: Record<string, string>;
        error?: string;
      }>;
      deleteDraft: (
        key: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      saveQueuedMessages: (
        key: string,
        messages: string[],
      ) => Promise<{ ok: boolean; error?: string }>;
      getQueuedMessages: (key: string) => Promise<{
        ok: boolean;
        messages: string[];
        error?: string;
      }>;
      getAllQueuedMessages: () => Promise<{
        ok: boolean;
        queuedMessages: Record<string, string[]>;
        error?: string;
      }>;
      deleteQueuedMessages: (
        key: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      // Performance tracing
      startTracing: () => Promise<
        { ok: true } | { ok: false; message: string }
      >;
      stopTracing: () => Promise<
        | { ok: true; filePath?: string; cancelled?: boolean }
        | { ok: false; message: string }
      >;
      // Memory model preference
      getMemoryModelPreference: () => Promise<{
        ok: boolean;
        modelKey: string | null;
      }>;
      setMemoryModelPreference: (
        modelKey: string | null,
      ) => Promise<{ ok: boolean }>;
      // Title model preference
      getTitleModelPreference: () => Promise<{
        ok: boolean;
        modelKey: string | null;
      }>;
      setTitleModelPreference: (
        modelKey: string | null,
      ) => Promise<{ ok: boolean }>;
      onMemorySaving: (
        listener: (payload: {
          conversationId: string;
          status: "started" | "completed" | "skipped" | "error";
          memoryId?: string | null;
        }) => void,
      ) => () => void;
      // Autocomplete model preference
      getAutocompleteModelPreference: () => Promise<{
        ok: boolean;
        enabled: boolean;
        modelKey: string | null;
      }>;
      setAutocompleteModelPreference: (
        enabled: boolean,
        modelKey: string | null,
      ) => Promise<{ ok: boolean }>;
      // Autocomplete suggestions
      getAutocompleteSuggestions: (params: {
        text: string;
        cursorPosition: number;
        conversationId?: string | null;
        maxSuggestions?: number;
      }) => Promise<{
        ok: boolean;
        suggestions?: Array<{
          id: string;
          text: string;
          type: "inline" | "suffix" | "block";
        }>;
        message?: string;
      }>;
    };
    chatonPiBridge?: {
      sendCommand: (
        conversationId: string,
        command: RpcCommand,
      ) => Promise<RpcResponse>;
    };
    pi: {
      getModels: () => Promise<PiModel[]>;
      getSettings: () => Promise<PiSettings>;
      updateSettings: (newSettings: Partial<PiSettings>) => Promise<PiSettings>;
      isUsingUserConfig: () => Promise<boolean>;
      metaHarnessListCandidates: (benchmarkId?: string | null) => Promise<{
        benchmarkId: string;
        activeCandidateId: string;
        candidates: Array<Record<string, unknown>>;
      }>;
      metaHarnessGetFrontier: (benchmarkId?: string | null) => Promise<{
        benchmarkId: string;
        frontier: Array<Record<string, unknown>>;
      }>;
      metaHarnessGetOptimizerState: () => Promise<Record<string, unknown>>;
      metaHarnessListOptimizerAttempts: (runId?: string | null) => Promise<Array<Record<string, unknown>>>;
      metaHarnessGetOptimizerAttemptResult: (input: {
        runId?: string | null;
        benchmarkId?: string | null;
        attemptId?: string | null;
        candidateId?: string | null;
      }) => Promise<{
        runId: string;
        attemptId: string | null;
        attempt: Record<string, unknown> | null;
        selectedCandidateId: string | null;
        candidate: Record<string, unknown> | null;
        score: Record<string, unknown> | null;
        summary: Record<string, unknown> | null;
        promptText: string | null;
        envSnapshotText: string | null;
        traceText: string | null;
        diffPatch: string | null;
      }>;
      metaHarnessGenerateHumanReport: (input: {
        runId?: string | null;
        benchmarkId?: string | null;
        attemptId?: string | null;
        candidateId?: string | null;
      }) => Promise<{
        title: string;
        summary: string;
        mainDiscovery: string;
        recommendation: "adopt" | "iterate" | "reject";
        findings: string[];
        evidence: string[];
        actions: Array<{
          title: string;
          rationale: string;
          implementation: string;
          priority: "high" | "medium" | "low";
          filesOrAreas: string[];
        }>;
        risks: string[];
      }>;
      metaHarnessStartOptimizer: (config: {
        benchmarkId?: string;
        optimizerModelProvider: string;
        optimizerModelId: string;
        optimizerThinkingLevel?: string | null;
        autoPromote?: boolean;
        loop?: boolean;
        maxIterations?: number | null;
        maxVariantsPerIteration?: number;
        minScoreDelta?: number;
        sleepMs?: number;
        validationModelProvider?: string | null;
        validationModelId?: string | null;
        validationThinkingLevel?: string | null;
      }) => Promise<Record<string, unknown>>;
      metaHarnessStopOptimizer: () => Promise<Record<string, unknown>>;
      metaHarnessTriageCandidates: (benchmarkId?: string | null) => Promise<
        | { benchmarkId: string; kept: string[]; removed: string[] }
        | { all: true; summary: Record<string, { kept: string[]; removed: string[] }>; totalKept: number; totalRemoved: number }
      >;
    };
    logger: {
      getLogs: (limit?: number, conversationId?: string | null) => Promise<
        Array<{
          timestamp: string;
          source: "electron" | "pi" | "frontend";
          level: "info" | "warn" | "error" | "debug";
          message: string;
          data?: unknown;
          conversationId?: string;
        }>
      >;
      clearLogs: () => Promise<boolean>;
      getLogFilePath: () => Promise<string>;
      saveCopy: () => Promise<{ ok: boolean; cancelled?: boolean; filePath?: string; message?: string }>;
      log: (
        level: "info" | "warn" | "error" | "debug",
        message: string,
        data?: unknown,
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
