import {
  ArrowUp,
  ListOrdered,
  Loader2,
  Plus,
  Square,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { useTranslation } from 'react-i18next';

import { Button } from "@/components/ui/button";
import { ComposerAttachments } from "@/components/shell/composer/ComposerAttachments";
import { ComposerModelControls } from "@/components/shell/composer/ComposerModelControls";
import { ComposerModificationsPanel } from "@/components/shell/composer/ComposerModificationsPanel";
import { ComposerQueue } from "@/components/shell/composer/ComposerQueue";
import { useComposerMessaging } from "@/components/shell/composer/useComposerMessaging";
import {
  buildAttachment,
  formatBytes,
} from "@/components/shell/composer/attachments";
import { computeThreadDeltaFiles, computeTotals, toStatByPath } from "@/components/shell/composer/git";
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
import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";

export function Composer() {
  const MODELS_SYNC_TTL_MS = 30_000;
  const { t } = useTranslation();
  const {
    state,
    createConversationGlobal,
    createConversationForProject,
    sendPiPrompt,
    setPiModel,
    setPiThinkingLevel,
    stopPi,
    setConversationAccessMode,
    setNotice,
  } = useWorkspace();
  const [models, setModels] = useState<PiModel[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(
    new Set(),
  );
  const [selectedModelKey, setSelectedModelKey] = useState<string>(
    () => readSavedGlobalModel() ?? "openai-codex/gpt-5.3-codex",
  );
  const [selectedThinking, setSelectedThinking] = useState<ThinkingLevel>("medium");
  const [selectedAccessMode, setSelectedAccessMode] = useState<"secure" | "open">(
    () => readSavedGlobalAccessMode(),
  );
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isUpdatingScope, setIsUpdatingScope] = useState(false);
  const [isModificationsExpandedByKey, setIsModificationsExpandedByKey] =
    useState<Record<string, boolean>>({});
  const [gitModifiedFiles, setGitModifiedFiles] = useState<ModifiedFileStat[]>([]);
  const [gitBaselineByConversationId, setGitBaselineByConversationId] =
    useState<Record<string, ModifiedFileStatByPath>>({});
  const [gitModificationTotals, setGitModificationTotals] = useState<{ files: number; added: number; removed: number }>({
    files: 0,
    added: 0,
    removed: 0,
  });
  const [openDiffPaths, setOpenDiffPaths] = useState<Record<string, boolean>>({});
  const [diffByPath, setDiffByPath] = useState<Record<string, FileDiffDetails>>({});
  const [diffLoadingByPath, setDiffLoadingByPath] = useState<Record<string, boolean>>({});
  const [diffErrorByPath, setDiffErrorByPath] = useState<Record<string, string | null>>({});
  const [currentChangeIndexByPath, setCurrentChangeIndexByPath] = useState<Record<string, number>>({});
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const footerRef = useRef<HTMLElement | null>(null);
  const backgroundSyncRef = useRef(0);
  const lastModelsSyncAtRef = useRef(0);
  const modelsSyncInFlightRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCursorToEndRef = useRef(false);
  const previousComposerKeyRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dernierModelUtiliseRef = useRef<string | null>(
    readSavedGlobalModel(),
  );
  const selectedConversation = state.conversations.find(
    (conversation) => conversation.id === state.selectedConversationId,
  );
  const selectedRuntime = selectedConversation
    ? state.piByConversation[selectedConversation.id]
    : null;
  const isDraftConversation =
    state.selectedProjectId !== null && !selectedConversation;
  const composerKey = selectedConversation?.id ?? (state.selectedProjectId ? `draft:${state.selectedProjectId}` : "global");
  const isWorkingOnChanges = Boolean(
    selectedRuntime?.status === "streaming" ||
      selectedRuntime?.status === "starting" ||
      selectedRuntime?.pendingUserMessage,
  );
  const showModificationsPanel =
    Boolean(selectedConversation && gitModifiedFiles.length > 0);
  const isModificationsExpanded = isModificationsExpandedByKey[composerKey] ?? false;
  const showModificationsList = isModificationsExpanded;
  const diffFirstChangeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const diffChangeRefs = useRef<Record<string, Array<HTMLDivElement | null>>>({});
  const diffLinesContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasInlineDiffOpen = Object.values(openDiffPaths).some(Boolean);

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
    selectedModelKey,
    selectedThinking,
    selectedAccessMode,
    selectedRuntime,
    setNotice,
    createConversationGlobal,
    createConversationForProject,
    ensureGitBaselineForConversation: async (conversationId: string) => {
      await ensureGitBaselineForConversation(conversationId);
    },
    setPiThinkingLevel,
    requestConversationAutoTitle: (conversationId, messageATraiter) => {
      void workspaceIpc.requestConversationAutoTitle(conversationId, messageATraiter);
    },
    sendPiPrompt,
  });

  useLayoutEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;
    const mainPanel = footer.closest(".main-panel") as HTMLElement | null;
    if (!mainPanel) return;

    const applyHeight = () => {
      const rect = footer.getBoundingClientRect();
      mainPanel.style.setProperty("--composer-overlay-height", `${Math.ceil(rect.height)}px`);
    };

    applyHeight();
    const observer = new ResizeObserver(() => applyHeight());
    observer.observe(footer);
    window.addEventListener("resize", applyHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyHeight);
      mainPanel.style.removeProperty("--composer-overlay-height");
    };
  }, [showModificationsPanel, showModificationsList, hasInlineDiffOpen, fileAttenteMessages.length]);

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
      const custom = event as CustomEvent<{ conversationId?: string; message?: string }>;
      const payload = custom.detail;
      if (!payload?.conversationId || typeof payload.message !== "string") {
        return;
      }
      setMessageForKey(payload.conversationId as string, payload.message as string);
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

  const ensureGitBaselineForConversation = async (conversationId: string) => {
    if (gitBaselineByConversationId[conversationId]) {
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
  };

  useEffect(() => {
    let isCancelled = false;
    const conversationId = selectedConversation?.id;
    if (!conversationId) {
      setGitModifiedFiles([]);
      setGitModificationTotals({ files: 0, added: 0, removed: 0 });
      setOpenDiffPaths({});
      setDiffByPath({});
      setDiffLoadingByPath({});
      setDiffErrorByPath({});
      setCurrentChangeIndexByPath({});
      return;
    }

    const baseline = gitBaselineByConversationId[conversationId];
    if (!baseline) {
      setGitModifiedFiles([]);
      setGitModificationTotals({ files: 0, added: 0, removed: 0 });
      setOpenDiffPaths({});
      setDiffByPath({});
      setDiffLoadingByPath({});
      setDiffErrorByPath({});
      setCurrentChangeIndexByPath({});
      return;
    }

    const refresh = async () => {
      const result = await workspaceIpc.getGitDiffSummary(conversationId);
      if (isCancelled) return;
      if (!result.ok) {
        setGitModifiedFiles([]);
        setGitModificationTotals({ files: 0, added: 0, removed: 0 });
        setOpenDiffPaths({});
        setDiffByPath({});
        setDiffLoadingByPath({});
        setDiffErrorByPath({});
        setCurrentChangeIndexByPath({});
        return;
      }
      const threadFiles = computeThreadDeltaFiles(result.files, baseline);
      setGitModifiedFiles(threadFiles);
      setGitModificationTotals(computeTotals(threadFiles));
      setDiffByPath((previous) => {
        const next: Record<string, FileDiffDetails> = {};
        for (const file of threadFiles) {
          if (previous[file.path]) {
            next[file.path] = previous[file.path];
          }
        }
        return next;
      });
      setDiffLoadingByPath((previous) => {
        const next: Record<string, boolean> = {};
        for (const file of threadFiles) {
          if (previous[file.path]) {
            next[file.path] = previous[file.path];
          }
        }
        return next;
      });
      setDiffErrorByPath((previous) => {
        const next: Record<string, string | null> = {};
        for (const file of threadFiles) {
          if (previous[file.path]) {
            next[file.path] = previous[file.path];
          }
        }
        return next;
      });
      setOpenDiffPaths((previous) => {
        const next: Record<string, boolean> = {};
        for (const file of threadFiles) {
          if (previous[file.path]) next[file.path] = true;
        }
        return next;
      });
      setCurrentChangeIndexByPath((previous) => {
        const next: Record<string, number> = {};
        for (const file of threadFiles) {
          if (previous[file.path] !== undefined) next[file.path] = previous[file.path];
        }
        return next;
      });
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, isWorkingOnChanges ? 1500 : 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [
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

  const loadDiffForFile = async (path: string) => {
    const conversationId = selectedConversation?.id;
    if (!conversationId) {
      return;
    }
    setDiffLoadingByPath((previous) => ({ ...previous, [path]: true }));
    setDiffErrorByPath((previous) => ({ ...previous, [path]: null }));
    const result = await workspaceIpc.getGitFileDiff(conversationId, path);
    if (!result.ok) {
      setDiffLoadingByPath((previous) => ({ ...previous, [path]: false }));
      setDiffErrorByPath((previous) => ({
        ...previous,
        [path]: result.message ?? "Impossible de charger le diff pour ce fichier.",
      }));
      return;
    }
    const normalizedLines = result.diff.replace(/\r\n/g, "\n").split("\n");
    setDiffByPath((previous) => ({
      ...previous,
      [path]: {
        path: result.path,
        lines: normalizedLines,
        firstChangedLine: result.firstChangedLine,
        isBinary: result.isBinary,
      },
    }));
    setDiffLoadingByPath((previous) => ({ ...previous, [path]: false }));
  };

  const handleToggleDiffForFile = (path: string) => {
    setOpenDiffPaths((previous) => ({ ...previous, [path]: !previous[path] }));
    const existing = diffByPath[path];
    const isLoading = diffLoadingByPath[path];
    if (!existing && !isLoading) {
      void loadDiffForFile(path);
    }
  };

  const scrollToChange = (path: string, index: number) => {
    const nodes = diffChangeRefs.current[path] ?? [];
    const clamped = Math.max(0, Math.min(index, nodes.length - 1));
    setCurrentChangeIndexByPath((previous) => ({ ...previous, [path]: clamped }));
    const target = nodes[clamped];
    if (target) {
      const container = diffLinesContainerRefs.current[path];
      if (container) {
        const targetTop = target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2;
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
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void handleSendMessage();
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

  useEffect(() => {
    let mounted = true;
    setIsLoadingModels(true);
    Promise.all([workspaceIpc.listPiModels(), workspaceIpc.getPiConfigSnapshot()])
      .then(([result, snapshot]) => {
        if (!mounted) return;

        if (!result.ok) {
          setNotice("Impossible de récupérer les modèles Pi.");
          return;
        }

        const providers = new Set(
          Object.keys(((snapshot.models ?? {}).providers ?? {}) as Record<string, unknown>),
        );
        setConfiguredProviders(providers);
        const filteredModels = result.models.filter((model) =>
          providers.has(model.provider),
        );

        setModels(filteredModels);
        const modeleSauvegarde =
          dernierModelUtiliseRef.current ??
          readSavedGlobalModel();
        const modeleExistant =
          (modeleSauvegarde
            ? filteredModels.find((model) => model.key === modeleSauvegarde)
            : null) ?? null;
        const scoped = filteredModels.filter((model) => model.scoped);
        const defaultModel = modeleExistant ?? scoped[0] ?? filteredModels[0];
        if (defaultModel) {
          setSelectedModelKey(defaultModel.key);
          dernierModelUtiliseRef.current = defaultModel.key;
          saveGlobalModel(defaultModel.key);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoadingModels(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const syncId = backgroundSyncRef.current + 1;
    backgroundSyncRef.current = syncId;

    Promise.all([workspaceIpc.syncPiModels(), workspaceIpc.getPiConfigSnapshot()]).then(
      ([result, snapshot]) => {
      if (backgroundSyncRef.current !== syncId) return;
      if (!result.ok) return;

      const providers = new Set(
        Object.keys(((snapshot.models ?? {}).providers ?? {}) as Record<string, unknown>),
      );
      setConfiguredProviders(providers);
      const filteredModels = result.models.filter((model) =>
        providers.has(model.provider),
      );

      setModels(filteredModels);
      setSelectedModelKey((current) => {
        if (filteredModels.some((model) => model.key === current)) {
          return current;
        }
        const modeleSauvegarde =
          dernierModelUtiliseRef.current ??
          readSavedGlobalModel() ??
          findLastConversationModel(state.conversations);
        const fallback =
          (modeleSauvegarde
            ? filteredModels.find((model) => model.key === modeleSauvegarde)
            : null) ??
          filteredModels.find((model) => model.scoped) ??
          filteredModels[0];
        if (fallback) {
          dernierModelUtiliseRef.current = fallback.key;
          saveGlobalModel(fallback.key);
          return fallback.key;
        }
        return current;
      });
    });
  }, [state.conversations, state.selectedConversationId, state.selectedProjectId]);

  useEffect(() => {
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
      (modeleGlobal ? models.find((model) => model.key === modeleGlobal) : null) ??
      models.find((model) => model.scoped) ??
      models[0] ??
      null;

    const modeleActif =
      modeleDepuisConversation ??
      modeleDepuisRuntime ??
      (selectedRuntime?.status === "starting" ? modeleGlobal : null) ??
      fallback?.key ??
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
  }, [models, selectedConversation, selectedRuntime?.state?.model, selectedRuntime?.status, state.conversations]);

  useEffect(() => {
    if (selectedConversation?.accessMode) {
      setSelectedAccessMode(selectedConversation.accessMode);
      saveGlobalAccessMode(selectedConversation.accessMode);
      return;
    }
    setSelectedAccessMode(readSavedGlobalAccessMode());
  }, [selectedConversation?.accessMode]);

  const selectedModel = models.find((model) => model.key === selectedModelKey);
  const availableThinkingLevels = selectedModel?.supportsThinking ? selectedModel.thinkingLevels : [];

  useEffect(() => {
    if (availableThinkingLevels.length > 0 && !availableThinkingLevels.includes(selectedThinking)) {
      setSelectedThinking(availableThinkingLevels[0]);
    }
  }, [availableThinkingLevels, selectedThinking]);

  const handleToggleModelScoped = async (model: {
    id: string;
    provider: string;
    scoped: boolean;
  }) => {
    if (isUpdatingScope) return;

    const targetKey = `${model.provider}/${model.id}`;
    setModels((previous) =>
      previous.map((item) =>
        item.key === targetKey ? { ...item, scoped: !model.scoped } : item,
      ),
    );

    setIsUpdatingScope(true);
    const result = await workspaceIpc.setPiModelScoped(
      model.provider,
      model.id,
      !model.scoped,
    );
    setIsUpdatingScope(false);

    if (!result.ok) {
      setModels((previous) =>
        previous.map((item) =>
          item.key === targetKey ? { ...item, scoped: model.scoped } : item,
        ),
      );
      setNotice("Impossible de modifier le scope du modèle dans Pi.");
      return;
    }

    const filteredModels = result.models.filter((item) =>
      configuredProviders.has(item.provider),
    );
    setModels(filteredModels);
    if (!filteredModels.some((item) => item.key === selectedModelKey)) {
      const fallback =
        filteredModels.find((item) => item.scoped) ?? filteredModels[0];
      if (fallback) {
        setSelectedModelKey(fallback.key);
      }
    }
  };

  const refreshModelsForPicker = () => {
    const now = Date.now();
    if (
      models.length > 0 &&
      now - lastModelsSyncAtRef.current < MODELS_SYNC_TTL_MS
    ) {
      return;
    }
    if (modelsSyncInFlightRef.current) {
      return;
    }

    const syncId = backgroundSyncRef.current + 1;
    backgroundSyncRef.current = syncId;
    modelsSyncInFlightRef.current = true;
    setIsLoadingModels(true);

    Promise.all([workspaceIpc.syncPiModels(), workspaceIpc.getPiConfigSnapshot()])
      .then(([result, snapshot]) => {
        if (backgroundSyncRef.current !== syncId) return;
        if (!result.ok) return;

        const providers = new Set(
          Object.keys(((snapshot.models ?? {}).providers ?? {}) as Record<string, unknown>),
        );
        setConfiguredProviders(providers);
        const filteredModels = result.models.filter((model) =>
          providers.has(model.provider),
        );
        setModels(filteredModels);
        lastModelsSyncAtRef.current = Date.now();
      })
      .finally(() => {
        modelsSyncInFlightRef.current = false;
        if (backgroundSyncRef.current === syncId) {
          setIsLoadingModels(false);
        }
      });
  };

  const handleApplyModel = async (modelKey: string) => {
    setSelectedModelKey(modelKey);

    if (!selectedConversation) {
      return;
    }

    const parsedModel = parseModelKey(modelKey);
    if (!parsedModel) {
      setNotice("Format de modèle invalide.");
      return;
    }
    const response = await setPiModel(
      selectedConversation.id,
      parsedModel.provider,
      parsedModel.modelId,
    );
    if (!response.success) {
      setNotice(response.error ?? "Impossible de changer de modèle.");
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
      setNotice(
        response.error ?? "Impossible de changer le niveau de réflexion.",
      );
    }
  };

  const accessModeTooltip =
    selectedAccessMode === "secure"
      ? t("Mode sécurisé: comportement actuel, accès limité au contexte de la conversation.")
      : t("Mode ouvert: Chaton peut accéder à des fichiers/dossiers hors contexte initial et exécuter les commandes nécessaires.");

  const handleAccessModeChange = async (mode: "secure" | "open") => {
    setSelectedAccessMode(mode);
    saveGlobalAccessMode(mode);
    if (!selectedConversation) {
      return;
    }
    if (selectedConversation.accessMode === mode) {
      return;
    }
    const result = await setConversationAccessMode(selectedConversation.id, mode);
    if (!result.ok) {
      setNotice("Impossible de changer le mode d’accès de l’agent.");
      setSelectedAccessMode(selectedConversation.accessMode ?? "secure");
      return;
    }
    setNotice(null);
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
          error instanceof Error ? error.message : `Impossible de lire ${file.name}.`;
        setNotice(messageErreur);
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

  const isStreaming = Boolean(
    selectedRuntime?.state?.isStreaming ||
    selectedRuntime?.status === "streaming",
  );
  const isPiGettingReady = selectedRuntime?.status === "starting";
  const isProcessing =
    isStreaming ||
    isPiGettingReady ||
    Boolean(selectedRuntime?.pendingUserMessage) ||
    (selectedRuntime?.pendingCommands ?? 0) > 0;
  const isSendDisabled = isSubmitting;

  if (state.sidebarMode === "settings") {
    return null;
  }

  const shouldShowComposer = !!state.selectedConversationId;

  if (!shouldShowComposer) {
    return null;
  }

  return (
    <footer ref={footerRef} className={`composer-footer ${shouldShowComposer ? 'composer-footer-visible' : ''}`}>
      <div className="content-wrap">
        {state.notice ? (
          <div
            className="app-notice"
            role="status"
            onClick={() => setNotice(null)}
          >
            {state.notice}
          </div>
        ) : null}

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
        />

        <div
          className={`composer-shell ${isDragOverComposer ? "composer-shell-drag-over" : ""}`}
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
          <textarea
            ref={textareaRef}
            placeholder={
              selectedConversation
                ? `Répondre dans « ${selectedConversation.title} »`
                : isDraftConversation
                  ? "Écrivez votre premier message pour créer ce fil"
                  : "Sélectionnez un fil pour commencer"
            }
            value={message}
            onChange={(event) => setMessage(event.target.value)}
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
                isUpdatingScope={isUpdatingScope}
                onApplyModel={handleApplyModel}
                onToggleModelScoped={handleToggleModelScoped}
                onThinkingChange={handleThinkingChange}
                onAccessModeChange={handleAccessModeChange}
                onOpenModelsMenu={refreshModelsForPicker}
                t={t}
              />
            </div>

            <div className="flex items-center gap-2">
              {isProcessing && selectedConversation ? (
                <Button
                  type="button"
                  className="send-button"
                  variant="secondary"
                  onClick={() => {
                    const confirmed = window.confirm(
                      'Êtes-vous sûr de vouloir arrêter Pi ?\n\n' +
                      'Toutes les modifications en cours seront perdues.'
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
                aria-label={isProcessing && !isSubmitting ? "Ajouter à la file" : undefined}
                title={isProcessing && !isSubmitting ? "Ajouter à la file" : undefined}
              >
                {isProcessing && !isSubmitting ? (
                  <ListOrdered className="send-button-icon" />
                ) : isSubmitting ? (
                  <Loader2 className="send-button-spinner animate-spin" />
                ) : (
                  <ArrowUp className="send-button-icon" />
                )}
              </Button>
            </div>
          </div>
        </div>

      </div>
    </footer>
  );
}
