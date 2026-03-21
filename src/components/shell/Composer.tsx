import { ArrowUp, ListOrdered, Loader2, Plus, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ComposerAttachments } from "@/components/shell/composer/ComposerAttachments";
import { ComposerModelControls } from "@/components/shell/composer/ComposerModelControls";
import { ComposerModificationsPanel } from "@/components/shell/composer/ComposerModificationsPanel";
import { ComposerQueue } from "@/components/shell/composer/ComposerQueue";
import { ComposerExtensionButtons } from "@/components/shell/composer/ComposerExtensionButtons";
import { ComposerRequirementSheet } from "@/components/shell/composer/ComposerRequirementSheet";
import { FileMentionPopover } from "@/components/shell/composer/FileMentionPopover";
import { FeatureMentionPopover } from "@/components/shell/composer/FeatureMentionPopover";
import { ComposerAutocomplete } from "@/components/shell/composer/ComposerAutocomplete";
import { useComposerMessaging } from "@/components/shell/composer/useComposerMessaging";
import { useModelCache } from "@/components/shell/composer/useModelCache";
import { useComposerExtensionButtons } from "@/hooks/use-composer-extension-buttons";
import { useComposerAutocomplete } from "@/hooks/use-composer-autocomplete";
import {
  buildAttachment,
  buildMessageWithAttachments,
  formatBytes,
} from "@/components/shell/composer/attachments";
import {
  computeThreadDeltaFiles,
  computeTotals,
  toStatByPath,
} from "@/components/shell/composer/git";
import {
  findLastConversationModel,
  parseModelKey,
  readSavedGlobalAccessMode,
  readSavedGlobalModel,
  saveGlobalAccessMode,
  saveGlobalModel,
  THINKING_LEVELS,
} from "@/components/shell/composer/models";
import type {
  FileDiffDetails,
  ModifiedFileStat,
  ModifiedFileStatByPath,
  PendingAttachment,
  PiModel,
  ThinkingLevel,
} from "@/components/shell/composer/types";
import type { ImageContent, FileContent } from "@/features/workspace/rpc";
import { useWorkspace } from "@/features/workspace/store";
import { usePiRuntimeMeta, usePiMessages } from "@/features/workspace/store/pi-store";
import { perfMonitor } from "@/features/workspace/store/perf-monitor";
import { workspaceIpc } from "@/services/ipc/workspace";
import { useConversationSidePanel } from "@/hooks/use-conversation-side-panel";
import { useNotifications } from "@/features/notifications/NotificationContext";

export function Composer() {
  perfMonitor.recordComponentRender('Composer')
  const { t } = useTranslation();
  const { addNotification } = useNotifications();
  const {
    state,
    createConversationGlobal,
    createConversationForProject,
    sendPiPrompt,
    setPiModel,
    setPiThinkingLevel,
    stopPi,
    setConversationAccessMode,
    clearThreadActionSuggestions,
  } = useWorkspace();

  // Side panel context to collapse when sending new message
  const { setIsOpen: setSidePanelOpen } = useConversationSidePanel();

  // Use the model cache hook
  const {
    models: cachedModels,
    configuredProviders: cachedProviders,
    isLoadingModels,
    isRefreshingInBackground,
    refreshModelsForPicker,
  } = useModelCache();

  const [optimisticModels, setOptimisticModels] = useState<PiModel[] | null>(
    null,
  );
  const models = optimisticModels ?? cachedModels;
  const configuredProviders = cachedProviders;

  useEffect(() => {
    if (!optimisticModels || cachedModels.length === 0) return;
    const optimisticMap = new Map(
      optimisticModels.map((model) => [model.key, model.scoped]),
    );
    const matches =
      optimisticModels.length === cachedModels.length &&
      cachedModels.every(
        (model) => optimisticMap.get(model.key) === model.scoped,
      );
    if (matches) {
       
      setOptimisticModels(null);
    }
  }, [cachedModels, optimisticModels]);

  const [selectedModelKey, setSelectedModelKey] = useState<string>(
    () => readSavedGlobalModel() ?? "openai-codex/gpt-5.3-codex",
  );
  const [selectedThinking, setSelectedThinking] =
    useState<ThinkingLevel>("medium");
  const [selectedAccessMode, setSelectedAccessMode] = useState<
    "secure" | "open"
  >(() => readSavedGlobalAccessMode());
  const [updatingModelKeys, setUpdatingModelKeys] = useState<Set<string>>(new Set());
  const [isModificationsExpandedByKey, setIsModificationsExpandedByKey] =
    useState<Record<string, boolean>>({});
  const [gitModifiedFiles, setGitModifiedFiles] = useState<ModifiedFileStat[]>(
    [],
  );
  const [gitBaselineByConversationId, setGitBaselineByConversationId] =
    useState<Record<string, ModifiedFileStatByPath>>({});
  // Keep a ref in sync so ensureGitBaselineForConversation can be stable (useCallback with no deps).
  const gitBaselineByConversationIdRef = useRef(gitBaselineByConversationId);
  useEffect(() => {
    gitBaselineByConversationIdRef.current = gitBaselineByConversationId;
  }, [gitBaselineByConversationId]);
  const [gitModificationTotals, setGitModificationTotals] = useState<{
    files: number;
    added: number;
    removed: number;
  }>({
    files: 0,
    added: 0,
    removed: 0,
  });
  // Diff states scoped by composerKey to avoid leaking between conversations
  const [openDiffPathsByKey, setOpenDiffPathsByKey] = useState<Record<string, Record<string, boolean>>>(
    {},
  );
  const [diffByPathByKey, setDiffByPathByKey] = useState<Record<string, Record<string, FileDiffDetails>>>(
    {},
  );
  const [diffLoadingByPathByKey, setDiffLoadingByPathByKey] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [diffErrorByPathByKey, setDiffErrorByPathByKey] = useState<
    Record<string, Record<string, string | null>>
  >({});
  const [currentChangeIndexByPathByKey, setCurrentChangeIndexByPathByKey] = useState<
    Record<string, Record<string, number>>
  >({});
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  // @ file mention state
  const [fileMentionOpen, setFileMentionOpen] = useState(false);
  // Autocomplete state
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [fileMentionQuery, setFileMentionQuery] = useState("");
  const [fileMentionStartIndex, setFileMentionStartIndex] = useState(-1);
  const [fileMentionAnchor, setFileMentionAnchor] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  // / feature mention state (for skills)
  const [featureMentionOpen, setFeatureMentionOpen] = useState(false);
  const [featureMentionQuery, setFeatureMentionQuery] = useState("");
  const [featureMentionStartIndex, setFeatureMentionStartIndex] = useState(-1);
  const [featureMentionAnchor, setFeatureMentionAnchor] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCursorToEndRef = useRef(false);
  const previousComposerKeyRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dernierModelUtiliseRef = useRef<string | null>(readSavedGlobalModel());
  const selectedConversation = state.conversations.find(
    (conversation) => conversation.id === state.selectedConversationId,
  );
  const selectedRuntime = usePiRuntimeMeta(selectedConversation?.id ?? null);
  // Messages are needed by the composer extension buttons hook for context usage calculation.
  // Separated from runtime to avoid re-rendering the entire Composer on every streaming token.
  const selectedMessages = usePiMessages(selectedConversation?.id ?? null);
  const threadActionSuggestions =
    selectedRuntime?.threadActionSuggestions ?? [];
  const isDraftConversation =
    state.selectedProjectId !== null && !selectedConversation;
  const composerKey =
    selectedConversation?.id ??
    (state.selectedProjectId ? `draft:${state.selectedProjectId}` : "global");
  const isAgentBusy = Boolean(
    selectedRuntime?.status === "streaming" ||
    selectedRuntime?.status === "starting" ||
    selectedRuntime?.pendingUserMessage,
  );
  const hasRpcInFlight = (selectedRuntime?.pendingCommands ?? 0) > 0;
  const isWorkingOnChanges = isAgentBusy;
  const showModificationsPanel = Boolean(
    selectedConversation && gitModifiedFiles.length > 0,
  );
  const isModificationsExpanded =
    isModificationsExpandedByKey[composerKey] ?? false;
  const showModificationsList = isModificationsExpanded;
  const diffFirstChangeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const diffChangeRefs = useRef<Record<string, Array<HTMLDivElement | null>>>(
    {},
  );
  const diffLinesContainerRefs = useRef<Record<string, HTMLDivElement | null>>(
    {},
  );
  // Derive per-conversation diff state from the scoped stores
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const openDiffPaths = openDiffPathsByKey[composerKey] ?? {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const diffByPath = diffByPathByKey[composerKey] ?? {};
  const diffLoadingByPath = diffLoadingByPathByKey[composerKey] ?? {};
  const diffErrorByPath = diffErrorByPathByKey[composerKey] ?? {};
  const currentChangeIndexByPath = currentChangeIndexByPathByKey[composerKey] ?? {};
  const hasInlineDiffOpen = Object.values(openDiffPaths).some(Boolean);
  const runtimeModelKey = selectedRuntime?.state?.model
    ? `${selectedRuntime.state.model.provider}/${selectedRuntime.state.model.id}`
    : null;
  const conversationModelKey =
    selectedConversation?.modelProvider && selectedConversation?.modelId
      ? `${selectedConversation.modelProvider}/${selectedConversation.modelId}`
      : null;
  const activeContextModelKey =
    conversationModelKey ??
    runtimeModelKey ??
    (selectedConversation ? selectedModelKey : null);
  const activeContextModel = activeContextModelKey
    ? models.find((model) => model.key === activeContextModelKey)
    : undefined;

  const {
    message,
    setMessage,
    setMessageForKey,
    pendingAttachments,
    setPendingAttachmentsByKey,
    fileAttenteMessages,
    setFileAttenteMessagesByKey,
    setIndexEditionFileAttenteByKey,
    isSubmitting,
    handleSendMessage,
  } = useComposerMessaging({
    composerKey,
    selectedProjectId: state.selectedProjectId,
    selectedConversationId: selectedConversation?.id ?? null,
    clearThreadActionSuggestions,
    selectedModelKey,
    selectedThinking,
    selectedAccessMode,
    selectedRuntime,
    createConversationGlobal,
    createConversationForProject,
    ensureGitBaselineForConversation: async (conversationId: string) => {
      await ensureGitBaselineForConversation(conversationId);
    },
    setPiThinkingLevel,
    requestConversationAutoTitle: (conversationId, messageATraiter) => {
      void workspaceIpc.requestConversationAutoTitle(
        conversationId,
        messageATraiter,
      );
    },
    sendPiPrompt,
    collapseSidePanel: () => setSidePanelOpen(false),
  });

  // Initialize composer extension buttons hook
  const {
    getAllButtons: getExtensionButtons,
    executeButtonAction,
    requirement,
    dismissRequirement,
    confirmRequirement,
    contextUsage,
  } = useComposerExtensionButtons({
    conversationId: selectedConversation?.id ?? null,
    projectId: state.selectedProjectId,
    setText: (text, append) => {
      setMessage(append ? message + text : text);
    },
    getText: () => message,
    addAttachment: async (file) => {
      const attachment = await buildAttachment(file);
      setPendingAttachmentsByKey((previous) => ({
        ...previous,
        [composerKey]: [...(previous[composerKey] ?? []), attachment],
      }));
    },
    sendMessage: handleSendMessage,
    getCurrentModel: async () => null, // Will be updated later
    getAvailableModels: async () => {
      return models.map((model) => ({
        provider: model.provider,
        id: model.id,
        name: `${model.provider} - ${model.id}`,
        capabilities: (model.supportsThinking ? ['thinking'] : []).concat(
          model.imageInput ? ['image-input'] : []
        ),
      }));
    },
    accessMode: selectedAccessMode,
    notify: (title, body, type) => addNotification(body ?? title, type ?? 'info'),
    messages: selectedMessages,
    contextWindow: activeContextModel?.contextWindow,
  });

  // Initialize autocomplete hook
  const {
    suggestion: autocompleteSuggestion,
    isAvailable: isAutocompleteAvailable,
    requestAutocomplete,
    clearSuggestions: clearAutocompleteSuggestions,
    acceptSuggestion: acceptAutocompleteSuggestion,
  } = useComposerAutocomplete({
    debounceMs: 400,
    minTextLength: 15,
    maxSuggestions: 1,
    enabled: true,
  });

  useLayoutEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;
    const mainPanel = footer.closest(".main-panel") as HTMLElement | null;
    if (!mainPanel) return;

    let frameId: number | null = null;

    const applyHeight = () => {
      frameId = null;
      const rect = footer.getBoundingClientRect();
      mainPanel.style.setProperty(
        "--composer-overlay-height",
        `${Math.ceil(rect.height)}px`,
      );
    };

    const scheduleApplyHeight = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(applyHeight);
    };

    applyHeight();
    const observer = new ResizeObserver(() => scheduleApplyHeight());
    observer.observe(footer);
    window.addEventListener("resize", scheduleApplyHeight);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
      window.removeEventListener("resize", scheduleApplyHeight);
      mainPanel.style.removeProperty("--composer-overlay-height");
    };
  }, [
    showModificationsPanel,
    showModificationsList,
    hasInlineDiffOpen,
    fileAttenteMessages.length,
    message,
  ]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("chaton:composer-draft-changed", {
        detail: { hasText: message.trim().length > 0 },
      }),
    );
  }, [message]);

  useEffect(() => {
    const previousKey = previousComposerKeyRef.current;
    previousComposerKeyRef.current = composerKey;
    if (previousKey === null || previousKey === composerKey) {
      return;
    }
    if (!state.selectedProjectId && !selectedConversation) {
      return;
    }
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [composerKey, selectedConversation, state.selectedProjectId]);

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const custom = event as CustomEvent<{
        conversationId?: string;
        message?: string;
      }>;
      const payload = custom.detail;
      if (!payload?.conversationId || typeof payload.message !== "string") {
        return;
      }
      setMessageForKey(
        payload.conversationId as string,
        payload.message as string,
      );
      pendingCursorToEndRef.current = true;
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        const node = textareaRef.current;
        if (node && pendingCursorToEndRef.current) {
          const end = node.value.length;
          node.setSelectionRange(end, end);
          pendingCursorToEndRef.current = false;
        }
      });
    };

    window.addEventListener("chaton:composer-prefill", handlePrefill);
    return () => {
      window.removeEventListener("chaton:composer-prefill", handlePrefill);
    };
  }, [setMessageForKey]);

  // Removed automatic expansion of modifications panel when working on changes
  // to keep it collapsed by default as requested

  // Stable function reference - reads baseline via ref to avoid recreating envoyerMessage
  // on every render (which would cause the queue useEffect to fire spuriously).
  const ensureGitBaselineForConversation = useCallback(async (conversationId: string) => {
    if (gitBaselineByConversationIdRef.current[conversationId]) {
      return;
    }
    const result = await workspaceIpc.getGitDiffSummary(conversationId);
    const baseline = result.ok ? toStatByPath(result.files) : {};
    setGitBaselineByConversationId((previous) => {
      if (previous[conversationId]) {
        return previous;
      }
      return {
        ...previous,
        [conversationId]: baseline,
      };
    });
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const conversationId = selectedConversation?.id;
    if (!conversationId) {
       
      setGitModifiedFiles([]);
      setGitModificationTotals({ files: 0, added: 0, removed: 0 });
      return;
    }

    const baseline = gitBaselineByConversationId[conversationId];
    if (!baseline) {
      setGitModifiedFiles([]);
      setGitModificationTotals({ files: 0, added: 0, removed: 0 });
      return;
    }

    const key = composerKey;

    const refresh = async () => {
      const result = await workspaceIpc.getGitDiffSummary(conversationId);
      if (isCancelled) return;
      if (!result.ok) {
        setGitModifiedFiles([]);
        setGitModificationTotals({ files: 0, added: 0, removed: 0 });
        return;
      }
      const threadFiles = computeThreadDeltaFiles(result.files, baseline);
      setGitModifiedFiles(threadFiles);
      setGitModificationTotals(computeTotals(threadFiles));
      // Prune stale entries from scoped diff state, keeping only paths still in threadFiles
      const pruneByThreadFiles = <T,>(prev: Record<string, Record<string, T>>): Record<string, Record<string, T>> => {
        const inner = prev[key];
        if (!inner) return prev;
        const next: Record<string, T> = {};
        for (const file of threadFiles) {
          if (inner[file.path] !== undefined) {
            next[file.path] = inner[file.path];
          }
        }
        return { ...prev, [key]: next };
      };
      setDiffByPathByKey(pruneByThreadFiles);
      setDiffLoadingByPathByKey(pruneByThreadFiles);
      setDiffErrorByPathByKey(pruneByThreadFiles);
      setOpenDiffPathsByKey(pruneByThreadFiles);
      setCurrentChangeIndexByPathByKey(pruneByThreadFiles);
    };

    void refresh();
    const timer = window.setInterval(
      () => {
        void refresh();
      },
      isWorkingOnChanges ? 1500 : 5000,
    );

    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [
    composerKey,
    gitBaselineByConversationId,
    isWorkingOnChanges,
    selectedConversation?.id,
  ]);

  useEffect(() => {
    for (const path of Object.keys(openDiffPaths)) {
      if (!openDiffPaths[path]) continue;
      const element = diffFirstChangeRefs.current[path];
      if (element) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [openDiffPaths, diffByPath]);

  // Helpers to update scoped diff state for the current composerKey
  const setScopedBooleanState = (
    setter: React.Dispatch<React.SetStateAction<Record<string, Record<string, boolean>>>>,
    path: string,
    value: boolean,
  ) => {
    setter((prev) => ({
      ...prev,
      [composerKey]: { ...(prev[composerKey] ?? {}), [path]: value },
    }));
  };

  const setScopedNullableStringState = (
    setter: React.Dispatch<React.SetStateAction<Record<string, Record<string, string | null>>>>,
    path: string,
    value: string | null,
  ) => {
    setter((prev) => ({
      ...prev,
      [composerKey]: { ...(prev[composerKey] ?? {}), [path]: value },
    }));
  };

  const setScopedDiffState = (
    setter: React.Dispatch<React.SetStateAction<Record<string, Record<string, FileDiffDetails>>>>,
    path: string,
    value: FileDiffDetails,
  ) => {
    setter((prev) => ({
      ...prev,
      [composerKey]: { ...(prev[composerKey] ?? {}), [path]: value },
    }));
  };

  const loadDiffForFile = async (path: string) => {
    const conversationId = selectedConversation?.id;
    if (!conversationId) {
      return;
    }
    setScopedBooleanState(setDiffLoadingByPathByKey, path, true);
    setScopedNullableStringState(setDiffErrorByPathByKey, path, null);
    const result = await workspaceIpc.getGitFileDiff(conversationId, path);
    if (!result.ok) {
      setScopedBooleanState(setDiffLoadingByPathByKey, path, false);
      setScopedNullableStringState(
        setDiffErrorByPathByKey,
        path,
        result.message ?? "Impossible de charger le diff pour ce fichier.",
      );
      return;
    }
    const normalizedLines = result.diff.replace(/\r\n/g, "\n").split("\n");
    setScopedDiffState(setDiffByPathByKey, path, {
      path: result.path,
      lines: normalizedLines,
      firstChangedLine: result.firstChangedLine,
      isBinary: result.isBinary,
    });
    setScopedBooleanState(setDiffLoadingByPathByKey, path, false);
  };

  const handleToggleDiffForFile = (path: string) => {
    setOpenDiffPathsByKey((prev) => ({
      ...prev,
      [composerKey]: {
        ...(prev[composerKey] ?? {}),
        [path]: !(prev[composerKey]?.[path] ?? false),
      },
    }));
    const existing = diffByPath[path];
    const isLoading = diffLoadingByPath[path];
    if (!existing && !isLoading) {
      void loadDiffForFile(path);
    }
  };

  const scrollToChange = (path: string, index: number) => {
    const nodes = diffChangeRefs.current[path] ?? [];
    const clamped = Math.max(0, Math.min(index, nodes.length - 1));
    setCurrentChangeIndexByPathByKey((prev) => ({
      ...prev,
      [composerKey]: { ...(prev[composerKey] ?? {}), [path]: clamped },
    }));
    const target = nodes[clamped];
    if (target) {
      const container = diffLinesContainerRefs.current[path];
      if (container) {
        const targetTop =
          target.offsetTop -
          container.clientHeight / 2 +
          target.clientHeight / 2;
        container.scrollTo({
          top: Math.max(0, targetTop),
          behavior: "smooth",
        });
      } else {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // When file mention popover is open, let it handle key events
    if (fileMentionOpen) {
      return;
    }

    // When feature mention popover is open, let it handle key events
    if (featureMentionOpen) {
      return;
    }

    // Handle autocomplete Tab key
    if (event.key === "Tab" && autocompleteOpen && autocompleteSuggestion) {
      event.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        const cursorPos = textarea.selectionStart;
        const result = acceptAutocompleteSuggestion(message, autocompleteSuggestion, cursorPos);
        setMessage(result.newText);
        setAutocompleteOpen(false);
        clearAutocompleteSuggestions();
        // Restore cursor position after the inserted text
        requestAnimationFrame(() => {
          if (textarea) {
            textarea.focus();
            const newPos = Math.min(result.newCursorPosition, textarea.value.length);
            textarea.setSelectionRange(newPos, newPos);
          }
        });
      }
      return;
    }

    // Shift+Enter: if conversation is busy, send as steer immediately
    // Otherwise, allow default behavior (new line insertion)
    if (event.key === "Enter" && event.shiftKey) {
      const isConversationBusy = Boolean(
        selectedRuntime?.status === "streaming" ||
        selectedRuntime?.status === "starting" ||
        selectedRuntime?.pendingUserMessage ||
        (selectedRuntime?.pendingCommands ?? 0) > 0
      );

      if (isConversationBusy && selectedConversation?.id) {
        event.preventDefault();
        const messageToSend = message.trim();
        if (!messageToSend && pendingAttachments.length === 0) {
          return;
        }
        const images = pendingAttachments
          .map((piece) => piece.image)
          .filter((piece): piece is ImageContent => Boolean(piece));
        const files = pendingAttachments
          .map((piece) => piece.file)
          .filter((piece): piece is FileContent => Boolean(piece));
        const finalMessage = buildMessageWithAttachments(messageToSend, pendingAttachments);

        // Send as steer immediately
        void sendPiPrompt({
          conversationId: selectedConversation.id,
          message: finalMessage,
          steer: true,
          images,
          files,
        });

        // Clear the input and attachments
        setMessage("");
        setPendingAttachmentsByKey((previous) => ({ ...previous, [composerKey]: [] }));
      }
      return;
    }

    // Regular Enter (without Shift): send message
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void handleSendMessage();
  };

  // Detect @ trigger and compute popover anchor position
  const handleComposerChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setMessage(value);

    const cursorPos = event.target.selectionStart;
    // Look backward from cursor for an unmatched @
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf("@");

    if (lastAt === -1) {
      setFileMentionOpen(false);
    } else {
      // Make sure @ is at start of input or preceded by whitespace
      if (lastAt > 0 && !/\s/.test(textBeforeCursor[lastAt - 1])) {
        setFileMentionOpen(false);
      } else {
        const queryAfterAt = textBeforeCursor.slice(lastAt + 1);
        // Close if there's a newline (they navigated away)
        if (queryAfterAt.includes("\n")) {
          setFileMentionOpen(false);
        } else if (queryAfterAt.endsWith(" ")) {
          // Close if query ends with a space (finished typing the file path)
          setFileMentionOpen(false);
        } else if (/[,;:!?<>"'|]/.test(queryAfterAt)) {
          // Close if query contains characters that typically separate text segments
          setFileMentionOpen(false);
        } else {
          setFileMentionOpen(true);
          setFileMentionQuery(queryAfterAt);
          setFileMentionStartIndex(lastAt);

          // Calculate anchor position from textarea caret
          const textarea = textareaRef.current;
          if (textarea) {
            const rect = textarea.getBoundingClientRect();
            const shellEl = textarea.closest(".composer-shell");
            const shellRect = shellEl?.getBoundingClientRect();
            setFileMentionAnchor({
              left: 12,
              bottom: shellRect ? shellRect.height + 4 : rect.height + 12,
            });
          }
        }
      }
    }

    // Request autocomplete suggestions if available and not showing file mention or feature mention
    if (!fileMentionOpen && !featureMentionOpen && isAutocompleteAvailable) {
      // Request suggestions (debounced internally)
      requestAutocomplete(value, cursorPos, selectedConversation?.id ?? null);
      setAutocompleteOpen(true);
    } else {
      clearAutocompleteSuggestions();
      setAutocompleteOpen(false);
    }

    // Detect / trigger for feature mention (skills) - only at start of input
    const lastSlash = textBeforeCursor.lastIndexOf("/");
    
    if (lastSlash === -1) {
      setFeatureMentionOpen(false);
    } else {
      // Make sure / is at start of input or preceded by whitespace, and that there's no text after it
      const textAfterSlash = textBeforeCursor.slice(lastSlash + 1);
      
      // Only open if / is at position 0 or preceded by whitespace, and there's no @ before it
      const hasTextBeforeSlash = lastSlash > 0;
      const precededByWhitespace = hasTextBeforeSlash && /\s/.test(textBeforeCursor[lastSlash - 1]);
      const hasUnmatchedAt = textBeforeCursor.lastIndexOf("@") > lastSlash;
      
      // Only trigger if / is at start of conversation (position 0)
      // and there's no text before it (or it's preceded by whitespace)
      // and it's not preceded by an @
      if (lastSlash === 0 || (precededByWhitespace && !hasUnmatchedAt)) {
        // Close if there's a newline (they navigated away)
        if (textAfterSlash.includes("\n")) {
          setFeatureMentionOpen(false);
        } else if (textAfterSlash.endsWith(" ")) {
          // Close if query ends with a space (finished typing)
          setFeatureMentionOpen(false);
        } else if (/[,;:!?<>"'|]/.test(textAfterSlash)) {
          // Close if query contains characters that typically separate text segments
          setFeatureMentionOpen(false);
        } else {
          setFeatureMentionOpen(true);
          setFeatureMentionQuery(textAfterSlash);
          setFeatureMentionStartIndex(lastSlash);

          // Calculate anchor position from textarea caret
          const textarea = textareaRef.current;
          if (textarea) {
            const rect = textarea.getBoundingClientRect();
            const shellEl = textarea.closest(".composer-shell");
            const shellRect = shellEl?.getBoundingClientRect();
            setFeatureMentionAnchor({
              left: 12,
              bottom: shellRect ? shellRect.height + 4 : rect.height + 12,
            });
          }
        }
      } else {
        setFeatureMentionOpen(false);
      }
    }
  };

  const handleFileMentionSelect = (result: { path: string }) => {
    // Replace @query with the selected file path
    const before = message.slice(0, fileMentionStartIndex);
    const after = message.slice(
      fileMentionStartIndex + 1 + fileMentionQuery.length,
    );
    const newMessage = `${before}@${result.path} ${after}`;
    setMessage(newMessage);
    setFileMentionOpen(false);
    setFileMentionQuery("");
    setFileMentionStartIndex(-1);
    // Refocus textarea and place cursor after inserted path
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        const newPos = before.length + 1 + result.path.length + 1;
        textarea.setSelectionRange(newPos, newPos);
      }
    });
  };

  const handleFileMentionClose = () => {
    setFileMentionOpen(false);
    setFileMentionQuery("");
    setFileMentionStartIndex(-1);
  };

  const handleFeatureMentionSelect = (result: { type: "skill"; source: string; title: string }) => {
    // Replace /query with the selected skill mention
    const before = message.slice(0, featureMentionStartIndex);
    const after = message.slice(
      featureMentionStartIndex + 1 + featureMentionQuery.length,
    );
    // Insert skill mention: /skill-name
    const newMessage = `${before}/${result.title}${after}`;
    setMessage(newMessage);
    setFeatureMentionOpen(false);
    setFeatureMentionQuery("");
    setFeatureMentionStartIndex(-1);
    // Refocus textarea and place cursor after inserted skill
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        const newPos = before.length + 1 + result.title.length + 1;
        textarea.setSelectionRange(newPos, newPos);
      }
    });
  };

  const handleFeatureMentionClose = () => {
    setFeatureMentionOpen(false);
    setFeatureMentionQuery("");
    setFeatureMentionStartIndex(-1);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const computedStyles = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyles.lineHeight) || 20;
    const maxHeight = lineHeight * 6;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [message]);

  // Model selection logic - only run when models are available.
  // Never override an explicit conversation/runtime model with the saved global model.
  useEffect(() => {
    if (models.length === 0) return;
    if (selectedConversation?.modelProvider && selectedConversation?.modelId) {
      return;
    }
    if (selectedRuntime?.state?.model) {
      return;
    }

    const modeleSauvegarde =
      dernierModelUtiliseRef.current ?? readSavedGlobalModel();
    const modeleExistant =
      (modeleSauvegarde
        ? models.find((model) => model.key === modeleSauvegarde)
        : null) ?? null;
    const scoped = models.filter((model) => model.scoped);
    const defaultModel = modeleExistant ?? scoped[0] ?? models[0];
    if (defaultModel) {
       
      setSelectedModelKey(defaultModel.key);
      dernierModelUtiliseRef.current = defaultModel.key;
      saveGlobalModel(defaultModel.key);
    }
  }, [models, selectedConversation?.modelProvider, selectedConversation?.modelId, selectedRuntime?.state?.model]);

  // Consolidated model selection logic - handles all scenarios without race conditions
  useEffect(() => {
    if (models.length === 0) return;

    // Priority 1: Explicit conversation model (if in a conversation)
    const modeleDepuisConversation =
      selectedConversation?.modelProvider && selectedConversation?.modelId
        ? `${selectedConversation.modelProvider}/${selectedConversation.modelId}`
        : null;

    // Priority 2: Runtime model (if runtime is active)
    const modeleDepuisRuntime = selectedRuntime?.state?.model
      ? `${selectedRuntime.state.model.provider}/${selectedRuntime.state.model.id}`
      : null;

    // Priority 3: Fallback logic for new conversations or when no explicit model is set
    if (!modeleDepuisConversation && !modeleDepuisRuntime) {
      const modeleGlobal =
        dernierModelUtiliseRef.current ??
        readSavedGlobalModel() ??
        findLastConversationModel(state.conversations);

      const fallbackModel =
        (modeleGlobal
          ? models.find((model) => model.key === modeleGlobal)
          : null) ??
        models.find((model) => model.scoped) ??
        models[0] ??
        null;

      const modeleActif = fallbackModel?.key ?? null;

      if (modeleActif) {
         
        setSelectedModelKey(modeleActif);
        dernierModelUtiliseRef.current = modeleActif;
        saveGlobalModel(modeleActif);
      }
    } else {
      // Use conversation or runtime model
      const modeleActif = modeleDepuisConversation ?? modeleDepuisRuntime;
      if (modeleActif) {
        setSelectedModelKey(modeleActif);
        dernierModelUtiliseRef.current = modeleActif;
        saveGlobalModel(modeleActif);
      }
    }

    // Handle thinking level synchronization
    if (selectedConversation?.thinkingLevel) {
      const level =
        selectedConversation.thinkingLevel as typeof selectedThinking;
      if (THINKING_LEVELS.includes(level)) {
        setSelectedThinking(level);
      }
    }
  }, [
    models,
    selectedConversation,
    selectedRuntime?.state?.model,
    state.conversations,
  ]);

  // REMOVED: This effect was causing a race condition with the model selection logic above.
  // The consolidated logic below handles all model selection scenarios.
  /* useEffect(() => {
    const modeleDepuisConversation =
      selectedConversation?.modelProvider && selectedConversation?.modelId
        ? `${selectedConversation.modelProvider}/${selectedConversation.modelId}`
        : null;
    const modeleDepuisRuntime = selectedRuntime?.state?.model
      ? `${selectedRuntime.state.model.provider}/${selectedRuntime.state.model.id}`
      : null;
    const modeleGlobal =
      dernierModelUtiliseRef.current ??
      readSavedGlobalModel() ??
      findLastConversationModel(state.conversations);

    const fallback =
      (modeleGlobal
        ? models.find((model) => model.key === modeleGlobal)
        : null) ??
      models.find((model) => model.scoped) ??
      models[0] ??
      null;

    const modeleActif =
      modeleDepuisConversation ??
      modeleDepuisRuntime ??
      fallback?.key ??
      (selectedRuntime?.status === "starting" ? modeleGlobal : null) ??
      null;

    if (modeleActif) {
      setSelectedModelKey(modeleActif);
      dernierModelUtiliseRef.current = modeleActif;
      saveGlobalModel(modeleActif);
    }

    if (selectedConversation?.thinkingLevel) {
      const level =
        selectedConversation.thinkingLevel as typeof selectedThinking;
      if (THINKING_LEVELS.includes(level)) {
        setSelectedThinking(level);
      }
    }
  }, [
    models,
    selectedConversation,
    selectedRuntime?.state?.model,
    selectedRuntime?.status,
    state.conversations,
  ]); */

  useEffect(() => {
    if (selectedConversation?.accessMode) {
       
      setSelectedAccessMode(selectedConversation.accessMode);
      saveGlobalAccessMode(selectedConversation.accessMode);
      return;
    }
    setSelectedAccessMode(readSavedGlobalAccessMode());
  }, [selectedConversation?.accessMode]);

  const selectedModel = models.find((model) => model.key === selectedModelKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const availableThinkingLevels = selectedModel?.supportsThinking
    ? selectedModel.thinkingLevels
    : [];

  useEffect(() => {
    if (
      availableThinkingLevels.length > 0 &&
      !availableThinkingLevels.includes(selectedThinking)
    ) {
       
      setSelectedThinking(availableThinkingLevels[0]);
    }
  }, [availableThinkingLevels, selectedThinking]);

  const handleToggleModelScoped = async (model: {
    id: string;
    provider: string;
    scoped: boolean;
  }) => {
    const targetKey = `${model.provider}/${model.id}`;

    // Skip if this specific model is already being updated
    if (updatingModelKeys.has(targetKey)) return;

    // Mark this model as updating
    setUpdatingModelKeys((prev) => new Set(prev).add(targetKey));

    // Apply optimistic update immediately
    setOptimisticModels((previous) =>
      (previous ?? models).map((item) =>
        item.key === targetKey ? { ...item, scoped: !model.scoped } : item,
      ),
    );

    const result = await workspaceIpc.setPiModelScoped(
      model.provider,
      model.id,
      !model.scoped,
    );

    // Remove this model from updating set
    setUpdatingModelKeys((prev) => {
      const next = new Set(prev);
      next.delete(targetKey);
      return next;
    });

    if (!result.ok) {
      // Revert optimistic update on error
      setOptimisticModels((previous) =>
        (previous ?? models).map((item) =>
          item.key === targetKey ? { ...item, scoped: model.scoped } : item,
        ),
      );
      addNotification("Impossible de modifier le scope du modèle dans Pi.", 'error');
      return;
    }

    // Refresh the cache to sync with server state
    await refreshModelsForPicker();

    // Clear optimistic state since cache now has the correct data
    setOptimisticModels(null);

    // Filter models by configured providers
    const filteredModels = result.models.filter((item) =>
      configuredProviders.has(item.provider),
    );
    if (!filteredModels.some((item) => item.key === selectedModelKey)) {
      const fallback =
        filteredModels.find((item) => item.scoped) ?? filteredModels[0];
      if (fallback) {
        setSelectedModelKey(fallback.key);
      }
    }
  };

  // refreshModelsForPicker is now provided by useModelCache hook

  const handleApplyModel = async (modelKey: string) => {
    setSelectedModelKey(modelKey);

    if (!selectedConversation) {
      return;
    }

    const parsedModel = parseModelKey(modelKey);
    if (!parsedModel) {
      addNotification("Format de modèle invalide.", 'error');
      return;
    }
    const response = await setPiModel(
      selectedConversation.id,
      parsedModel.provider,
      parsedModel.modelId,
    );
    if (!response.success) {
      addNotification(response.error ?? "Impossible de changer de modèle.", 'error');
    }
  };

  const handleThinkingChange = async (level: ThinkingLevel) => {
    if (!availableThinkingLevels.includes(level)) {
      return;
    }
    setSelectedThinking(level);

    if (!selectedConversation) {
      return;
    }

    const response = await setPiThinkingLevel(selectedConversation.id, level);
    if (!response.success) {
      addNotification(
        response.error ?? "Impossible de changer le niveau de réflexion.",
        'error',
      );
    }
  };

  const accessModeTooltip =
    selectedAccessMode === "secure"
      ? t(
          "Mode sécurisé: comportement actuel, accès limité au contexte de la conversation.",
        )
      : t(
          "Mode ouvert: Chaton peut accéder à des fichiers/dossiers hors contexte initial et exécuter les commandes nécessaires.",
        );

  const handleAccessModeChange = async (mode: "secure" | "open") => {
    setSelectedAccessMode(mode);
    saveGlobalAccessMode(mode);
    if (!selectedConversation) {
      return;
    }
    if (selectedConversation.accessMode === mode) {
      return;
    }
    const result = await setConversationAccessMode(
      selectedConversation.id,
      mode,
    );
    if (!result.ok) {
      const errorMessage = result.reason === 'restart_failed'
        ? `Mode changed but session restart failed: ${result.message || 'Unknown error'}`
        : t('composer.accessModeChangeFailed', 'Unable to change agent access mode.');
      addNotification(errorMessage, 'error');
      setSelectedAccessMode(selectedConversation.accessMode ?? "secure");
      return;
    }
  };

  const ajouterFichiers = async (files: FileList | File[]) => {
    const array = Array.from(files);
    if (array.length === 0) {
      return;
    }
    const nextAttachments: PendingAttachment[] = [];
    for (const file of array) {
      try {
        const attachment = await buildAttachment(file);
        nextAttachments.push(attachment);
      } catch (error) {
        const messageErreur =
          error instanceof Error
            ? error.message
            : `Impossible de lire ${file.name}.`;
        addNotification(messageErreur, 'error');
      }
    }
    if (nextAttachments.length > 0) {
      setPendingAttachmentsByKey((previous) => ({
        ...previous,
        [composerKey]: [...(previous[composerKey] ?? []), ...nextAttachments],
      }));
      textareaRef.current?.focus();
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) {
      return;
    }
    void ajouterFichiers(files);
    event.target.value = "";
  };

  const handleComposerDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.types.includes("Files")) {
      event.dataTransfer.dropEffect = "copy";
      setIsDragOverComposer(true);
    }
  };

  const handleComposerDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setIsDragOverComposer(false);
  };

  const handleComposerDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOverComposer(false);
    if (event.dataTransfer.files.length === 0) {
      return;
    }
    void ajouterFichiers(event.dataTransfer.files);
  };

  const isPiGettingReady = selectedRuntime?.status === "starting";
  const isProcessing = isAgentBusy || hasRpcInFlight;
  // Never disable the send button based on isSubmitting: while an IPC send is
  // in-flight the handler will queue the message rather than drop it.
  const isSendDisabled = false;
  const shouldHideComposer =
    state.sidebarMode === "settings" || state.sidebarMode === "channels";
  const shouldShowComposer = !!state.selectedConversationId;

  if (shouldHideComposer || !shouldShowComposer) {
    return null;
  }

  return (
    <>
      <footer
      ref={footerRef}
      className={`composer-footer ${shouldShowComposer ? "composer-footer-visible" : ""}`}
    >
      <div className="content-wrap">

        {showModificationsPanel ? (
          <ComposerModificationsPanel
            composerKey={composerKey}
            files={gitModifiedFiles}
            totals={gitModificationTotals}
            isWorkingOnChanges={isWorkingOnChanges}
            selectedConversationId={selectedConversation?.id ?? null}
            showModificationsList={showModificationsList}
            hasInlineDiffOpen={hasInlineDiffOpen}
            openDiffPaths={openDiffPaths}
            diffLoadingByPath={diffLoadingByPath}
            diffErrorByPath={diffErrorByPath}
            diffByPath={diffByPath}
            currentChangeIndexByPath={currentChangeIndexByPath}
            onTogglePanel={() =>
              setIsModificationsExpandedByKey((previous) => ({
                ...previous,
                [composerKey]: !(previous[composerKey] ?? false),
              }))
            }
            onStopPi={(conversationId) => {
              void stopPi(conversationId);
            }}
            onToggleDiffForFile={handleToggleDiffForFile}
            onScrollToChange={scrollToChange}
            onSetDiffLineContainerRef={(path, element) => {
              diffLinesContainerRefs.current[path] = element;
            }}
            onSetFirstDiffChangeRef={(path, element) => {
              diffFirstChangeRefs.current[path] = element;
            }}
            onSetDiffChangeRef={(path, index, element) => {
              if (!diffChangeRefs.current[path]) {
                diffChangeRefs.current[path] = [];
              }
              diffChangeRefs.current[path][index] = element;
            }}
            t={t}
          />
        ) : null}

        <ComposerQueue
          messages={fileAttenteMessages}
          onEdit={(item, index) => {
            setMessage(item);
            setIndexEditionFileAttenteByKey((previous) => ({
              ...previous,
              [composerKey]: index,
            }));
            textareaRef.current?.focus();
          }}
          onRemove={(index) => {
            setFileAttenteMessagesByKey((previous) => ({
              ...previous,
              [composerKey]: (previous[composerKey] ?? []).filter(
                (_, currentIndex) => currentIndex !== index,
              ),
            }));
            setIndexEditionFileAttenteByKey((previous) => {
              const current = previous[composerKey] ?? null;
              let next = current;
              if (current === index) next = null;
              else if (current !== null && current > index) next = current - 1;
              return { ...previous, [composerKey]: next };
            });
          }}
          onSteer={async (item, index) => {
            if (selectedConversation?.id && selectedRuntime?.status === "streaming") {
              try {
                await sendPiPrompt({
                  conversationId: selectedConversation.id,
                  message: item,
                  steer: true,
                  images: [],
                  files: [],
                });
                // Remove the steered message from queue after successful steering
                setFileAttenteMessagesByKey((previous) => ({
                  ...previous,
                  [composerKey]: (previous[composerKey] ?? []).filter(
                    (_, currentIndex) => currentIndex !== index,
                  ),
                }));
              } catch (error) {
                console.error("Failed to steer message:", error);
                // Keep the message in queue if steering fails
              }
            }
          }}
          isStreaming={selectedRuntime?.status === "streaming"}
        />

        <div
          className={`composer-shell ${isDragOverComposer ? "composer-shell-drag-over" : ""} ${isProcessing ? "composer-shell-active" : ""}`}
          onDragOver={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDrop={handleComposerDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,*/*"
            onChange={handleFileInputChange}
          />
          <ComposerAttachments
            attachments={pendingAttachments}
            formatBytes={formatBytes}
            onRemove={(attachmentId) => {
              setPendingAttachmentsByKey((previous) => ({
                ...previous,
                [composerKey]: (previous[composerKey] ?? []).filter(
                  (item) => item.id !== attachmentId,
                ),
              }));
            }}
          />
          {threadActionSuggestions.length > 0 ? (
            <div
              className="composer-thread-actions"
              role="group"
              aria-label="Suggested thread actions"
            >
              {threadActionSuggestions.slice(0, 4).map((action) => (
                <div key={action.id} className="composer-thread-action-wrapper">
                  <button
                    type="button"
                    className="composer-thread-action-badge"
                    onClick={() => {
                      if (!selectedConversation) {
                        return;
                      }
                      clearThreadActionSuggestions(selectedConversation.id);
                      setMessage(action.message);
                      requestAnimationFrame(() => {
                        void handleSendMessage();
                      });
                    }}
                    title={action.message}
                  >
                    {action.label}
                  </button>
                  <div className="composer-thread-action-tooltip">
                    {action.message}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <FileMentionPopover
            isOpen={fileMentionOpen}
            query={fileMentionQuery}
            conversationId={selectedConversation?.id ?? null}
            projectId={state.selectedProjectId}
            anchorRect={fileMentionAnchor}
            onSelect={handleFileMentionSelect}
            onClose={handleFileMentionClose}
            textareaRef={textareaRef}
          />
          {/* Feature mention popover (slash commands for skills) */}
          <FeatureMentionPopover
            isOpen={featureMentionOpen}
            query={featureMentionQuery}
            anchorRect={featureMentionAnchor}
            onSelect={handleFeatureMentionSelect}
            onClose={handleFeatureMentionClose}
            textareaRef={textareaRef}
          />
          {/* Autocomplete inline ghost text */}
          {autocompleteOpen && !fileMentionOpen && !featureMentionOpen && isAutocompleteAvailable && autocompleteSuggestion && (
            <div className="composer-autocomplete-inline-container">
              <ComposerAutocomplete
                isVisible={true}
                suggestion={autocompleteSuggestion}
                currentText={message}
                cursorPosition={textareaRef.current?.selectionStart ?? 0}
                onAccept={() => {
                  const textarea = textareaRef.current;
                  if (textarea && autocompleteSuggestion) {
                    const cursorPos = textarea.selectionStart;
                    const result = acceptAutocompleteSuggestion(
                      message,
                      autocompleteSuggestion,
                      cursorPos,
                    );
                    setMessage(result.newText);
                    clearAutocompleteSuggestions();
                    // Restore cursor position
                    requestAnimationFrame(() => {
                      if (textarea) {
                        textarea.focus();
                        textarea.setSelectionRange(
                          result.newCursorPosition,
                          result.newCursorPosition,
                        );
                      }
                    });
                  }
                }}
                textareaRef={textareaRef}
              />
            </div>
          )}
          <textarea
            ref={textareaRef}
            placeholder={
              selectedConversation
                ? `Répondre dans « ${selectedConversation.title} »`
                : isDraftConversation
                  ? "Écrivez votre premier message pour créer cette conversation"
                  : "Sélectionnez une conversation pour commencer"
            }
            value={message}
            onChange={handleComposerChange}
            onKeyDown={handleComposerKeyDown}
            className="composer-input"
            rows={1}
          />

          <div className="composer-meta">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-[#696b73]"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Ajouter des fichiers"
              >
                <Plus className="h-5 w-5" />
              </Button>
              <ComposerModelControls
                models={models}
                selectedModelKey={selectedModelKey}
                selectedThinking={selectedThinking}
                selectedAccessMode={selectedAccessMode}
                accessModeTooltip={accessModeTooltip}
                isLoadingModels={isLoadingModels}
                updatingModelKeys={updatingModelKeys}
                onApplyModel={handleApplyModel}
                onToggleModelScoped={handleToggleModelScoped}
                onThinkingChange={handleThinkingChange}
                onAccessModeChange={handleAccessModeChange}
                onOpenModelsMenu={refreshModelsForPicker}
                t={t}
              />
              {isRefreshingInBackground && (
                <div
                  className="composer-cache-status"
                  title="Rafraîchissement des modèles en arrière-plan"
                >
                  <Loader2 className="composer-cache-spinner animate-spin h-4 w-4" />
                </div>
              )}
              {/* {cacheStatus === 'stale' && !isRefreshingInBackground && (
                <div
                  className="composer-cache-status stale"
                  title="La liste des modèles peut être obsolète. Cliquez pour rafraîchir"
                  onClick={refreshModelsForPicker}
                >
                  ⚠️
                </div>
              )} */}
            </div>

            <div className="flex items-center gap-2">
              <ComposerExtensionButtons
                buttons={getExtensionButtons().map((button) => ({
                  extensionId: button._extensionId || button.id,
                  button: button,
                }))}
                onClickButton={(_extensionId, button) => executeButtonAction(button.id)}
                disabled={isWorkingOnChanges}
                contextUsage={contextUsage}
                conversationId={selectedConversation?.id ?? null}
                projectId={state.selectedProjectId}
              />
              {isProcessing && selectedConversation ? (
                <Button
                  type="button"
                  className="send-button"
                  variant="secondary"
                  onClick={() => {
                    const confirmed = window.confirm(
                      "Êtes-vous sûr de vouloir arrêter Pi ?\n\n" +
                        "Toutes les modifications en cours seront perdues.",
                    );
                    if (confirmed) {
                      void stopPi(selectedConversation.id);
                    }
                  }}
                  disabled={!selectedConversation}
                  aria-label="Arrêter Pi"
                >
                  <Square className="send-button-icon" />
                </Button>
              ) : null}
              <Button
                type="button"
                className={`send-button ${isPiGettingReady ? "send-button-getting-ready" : ""}`}
                variant="default"
                onClick={() => {
                  void handleSendMessage();
                }}
                disabled={isSendDisabled}
                aria-label={
                  isProcessing && !isSubmitting
                    ? "Ajouter à la file"
                    : undefined
                }
                title={
                  isProcessing && !isSubmitting
                    ? "Ajouter à la file"
                    : undefined
                }
              >
                {isProcessing || isSubmitting ? (
                  <ListOrdered className="send-button-icon" />
                ) : (
                  <ArrowUp className="send-button-icon" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </footer>
    {requirement && (
      <ComposerRequirementSheet
        requirement={requirement}
        onDismiss={dismissRequirement}
        onConfirm={confirmRequirement}
      />
    )}
    </>
  );
}
