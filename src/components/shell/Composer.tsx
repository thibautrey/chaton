import {
  ArrowUp,
  Brain,
  ChevronDown,
  Loader2,
  Plus,
  Square,
  Star,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";

const THINKING_LEVELS: Array<
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
> = ["off", "minimal", "low", "medium", "high", "xhigh"];

function parseModelKey(modelKey: string): { provider: string; modelId: string } | null {
  const separator = modelKey.indexOf("/");
  if (separator <= 0 || separator >= modelKey.length - 1) {
    return null;
  }

  return {
    provider: modelKey.slice(0, separator),
    modelId: modelKey.slice(separator + 1),
  };
}

export function Composer() {
  const {
    state,
    createConversationForProject,
    sendPiPrompt,
    setPiModel,
    setPiThinkingLevel,
    stopPi,
    setNotice,
  } = useWorkspace();
  const [draftsByKey, setDraftsByKey] = useState<Record<string, string>>({});
  const [modelsMenuOpen, setModelsMenuOpen] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [models, setModels] = useState<
    Array<{
      id: string;
      provider: string;
      key: string;
      scoped: boolean;
      supportsThinking: boolean;
      thinkingLevels: Array<
        "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
      >;
    }>
  >([]);
  const [selectedModelKey, setSelectedModelKey] = useState<string>(
    "openai-codex/gpt-5.3-codex",
  );
  const [selectedThinking, setSelectedThinking] = useState<
    "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  >("medium");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isUpdatingScope, setIsUpdatingScope] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const backgroundSyncRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modelsMenuRef = useRef<HTMLDivElement | null>(null);
  const modelsMenuListRef = useRef<HTMLDivElement | null>(null);
  const modelsMenuListContentRef = useRef<HTMLDivElement | null>(null);
  const [modelsMenuListHeight, setModelsMenuListHeight] = useState(0);
  const selectedConversation = state.conversations.find(
    (conversation) => conversation.id === state.selectedConversationId,
  );
  const selectedRuntime = selectedConversation
    ? state.piByConversation[selectedConversation.id]
    : null;
  const isDraftConversation =
    state.selectedProjectId !== null && !selectedConversation;
  const composerKey = selectedConversation?.id ?? (state.selectedProjectId ? `draft:${state.selectedProjectId}` : "global");
  const message = draftsByKey[composerKey] ?? "";

  const setMessage = (next: string) => {
    setDraftsByKey((previous) => {
      if (next.length === 0) {
        if (!(composerKey in previous)) {
          return previous;
        }
        const updated = { ...previous };
        delete updated[composerKey];
        return updated;
      }

      return {
        ...previous,
        [composerKey]: next,
      };
    });
  };

  const handleSendMessage = async () => {
    const nextMessage = message.trim();
    const isPiGettingReady = selectedRuntime?.status === "starting";
    if (!nextMessage || isSubmitting || isPiGettingReady) {
      return;
    }

    setIsSubmitting(true);
    try {
      let conversationId = selectedConversation?.id;
      let shouldRequestAutoTitle = Boolean(
        selectedConversation?.title?.startsWith("Nouveau fil - "),
      );

      if (!conversationId) {
        if (!state.selectedProjectId) {
          setNotice("Sélectionnez un projet pour démarrer un fil.");
          return;
        }

        const parsedModel = parseModelKey(selectedModelKey);
        const createdConversation = await createConversationForProject(
          state.selectedProjectId,
          {
            modelProvider: parsedModel?.provider,
            modelId: parsedModel?.modelId,
            thinkingLevel: selectedThinking,
          },
        );
        if (!createdConversation) {
          return;
        }
        conversationId = createdConversation.id;
        shouldRequestAutoTitle = true;

        const setThinkingResponse = await setPiThinkingLevel(
          conversationId,
          selectedThinking,
        );
        if (!setThinkingResponse.success) {
          setNotice(
            setThinkingResponse.error ??
              "Impossible de changer le niveau de réflexion.",
          );
        }
      }

      await sendPiPrompt({ conversationId, message: nextMessage });
      if (shouldRequestAutoTitle) {
        void workspaceIpc.requestConversationAutoTitle(conversationId, nextMessage);
      }
      setDraftsByKey((previous) => {
        if (!(composerKey in previous)) {
          return previous;
        }
        const updated = { ...previous };
        delete updated[composerKey];
        return updated;
      });
    } finally {
      setIsSubmitting(false);
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
    workspaceIpc
      .listPiModels()
      .then((result) => {
        if (!mounted) return;

        if (!result.ok) {
          setNotice("Impossible de récupérer les modèles Pi.");
          return;
        }

        setModels(result.models);
        const scoped = result.models.filter((model) => model.scoped);
        const defaultModel = scoped[0] ?? result.models[0];
        if (defaultModel) {
          setSelectedModelKey(defaultModel.key);
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

    workspaceIpc.syncPiModels().then((result) => {
      if (backgroundSyncRef.current !== syncId) return;
      if (!result.ok) return;

      setModels(result.models);
      setSelectedModelKey((current) => {
        if (result.models.some((model) => model.key === current)) {
          return current;
        }
        const fallback =
          result.models.find((model) => model.scoped) ?? result.models[0];
        return fallback ? fallback.key : current;
      });
    });
  }, [state.selectedConversationId, state.selectedProjectId]);

  useEffect(() => {
    const handleWindowClick = (event: MouseEvent) => {
      if (!modelsMenuRef.current) return;
      if (modelsMenuRef.current.contains(event.target as Node)) return;
      setModelsMenuOpen(false);
      setShowAllModels(false);
      setThinkingMenuOpen(false);
    };

    window.addEventListener("mousedown", handleWindowClick);
    return () => window.removeEventListener("mousedown", handleWindowClick);
  }, []);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    if (selectedConversation.modelProvider && selectedConversation.modelId) {
      setSelectedModelKey(
        `${selectedConversation.modelProvider}/${selectedConversation.modelId}`,
      );
    } else if (selectedRuntime?.state?.model) {
      setSelectedModelKey(
        `${selectedRuntime.state.model.provider}/${selectedRuntime.state.model.id}`,
      );
    } else {
      const fallback =
        models.find((model) => model.scoped) ?? models[0];
      if (fallback) {
        setSelectedModelKey(fallback.key);
      }
    }
    if (selectedConversation.thinkingLevel) {
      const level =
        selectedConversation.thinkingLevel as typeof selectedThinking;
      if (THINKING_LEVELS.includes(level)) {
        setSelectedThinking(level);
      }
    }
  }, [models, selectedConversation, selectedRuntime?.state?.model]);

  const visibleModels = showAllModels
    ? models
    : models.filter((model) => model.scoped);
  const selectedModel = models.find((model) => model.key === selectedModelKey);
  const availableThinkingLevels =
    selectedModel?.supportsThinking && selectedModel.thinkingLevels.length > 0
      ? selectedModel.thinkingLevels
      : [];
  const supportsThinkingLevel = availableThinkingLevels.length > 0;
  const currentModelLabel =
    selectedModel?.id ?? selectedModelKey;

  useEffect(() => {
    if (!supportsThinkingLevel) {
      setThinkingMenuOpen(false);
      return;
    }
    if (!availableThinkingLevels.includes(selectedThinking)) {
      setSelectedThinking(availableThinkingLevels[0]);
    }
  }, [availableThinkingLevels, selectedThinking, supportsThinkingLevel]);

  const handleToggleModelScoped = async (model: {
    id: string;
    provider: string;
    scoped: boolean;
  }) => {
    if (isUpdatingScope) return;

    setIsUpdatingScope(true);
    const result = await workspaceIpc.setPiModelScoped(
      model.provider,
      model.id,
      !model.scoped,
    );
    setIsUpdatingScope(false);

    if (!result.ok) {
      setNotice("Impossible de modifier le scope du modèle dans Pi.");
      return;
    }

    setModels(result.models);
    if (!result.models.some((item) => item.key === selectedModelKey)) {
      const fallback =
        result.models.find((item) => item.scoped) ?? result.models[0];
      if (fallback) {
        setSelectedModelKey(fallback.key);
      }
    }
  };

  const handleApplyModel = async (modelKey: string) => {
    setSelectedModelKey(modelKey);
    setModelsMenuOpen(false);
    setShowAllModels(false);

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

  const handleThinkingChange = async (level: typeof selectedThinking) => {
    if (!availableThinkingLevels.includes(level)) {
      return;
    }
    setSelectedThinking(level);
    setThinkingMenuOpen(false);

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

  useLayoutEffect(() => {
    if (!modelsMenuOpen) {
      return;
    }
    const content = modelsMenuListContentRef.current;
    if (!content) {
      return;
    }
    setModelsMenuListHeight(Math.min(content.scrollHeight, 260));
  }, [modelsMenuOpen, showAllModels, visibleModels.length, isLoadingModels]);

  const isStreaming = Boolean(
    selectedRuntime?.state?.isStreaming ||
    selectedRuntime?.status === "streaming",
  );
  const isPiGettingReady = selectedRuntime?.status === "starting";
  const isSendDisabled = isSubmitting || isPiGettingReady;

  if (state.sidebarMode === "settings") {
    return null;
  }

  return (
    <footer className="composer-footer">
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

        <div className="composer-shell">
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
            <div className="flex items-center gap-1.5" ref={modelsMenuRef}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-[#696b73]"
              >
                <Plus className="h-5 w-5" />
              </Button>
              <div className="relative">
                <Badge
                  variant="secondary"
                  className="meta-chip cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => setModelsMenuOpen((open) => !open)}
                >
                  {currentModelLabel} <ChevronDown className="ml-1 h-4 w-4" />
                </Badge>

                {modelsMenuOpen ? (
                  <div
                    className="models-menu"
                    role="menu"
                    aria-label="Sélecteur de modèle"
                  >
                    <div
                      ref={modelsMenuListRef}
                      className="models-menu-list"
                      style={{ height: `${modelsMenuListHeight}px` }}
                    >
                      <div ref={modelsMenuListContentRef} className="models-menu-list-content">
                        {isLoadingModels ? (
                          <div className="models-menu-empty">
                            Chargement des modèles...
                          </div>
                        ) : visibleModels.length === 0 ? (
                          <div className="models-menu-empty">
                            {showAllModels
                              ? "Aucun modèle disponible."
                              : "Aucun modèle scoped. Cliquez sur more."}
                          </div>
                        ) : (
                          visibleModels.map((model) => (
                            <div key={model.key} className="models-menu-row">
                              <button
                                type="button"
                                className={`models-menu-item ${selectedModelKey === model.key ? "models-menu-item-active" : ""}`}
                                onClick={() => void handleApplyModel(model.key)}
                              >
                                <span>{model.id}</span>
                                <span className="models-menu-provider">
                                  {model.provider}
                                </span>
                              </button>
                              {showAllModels ? (
                                <button
                                  type="button"
                                  className="models-scope-button"
                                  aria-label={
                                    model.scoped
                                      ? "Retirer du scope"
                                      : "Ajouter au scope"
                                  }
                                  onClick={() =>
                                    void handleToggleModelScoped(model)
                                  }
                                  disabled={isUpdatingScope}
                                >
                                  <Star
                                    className={`h-4 w-4 ${model.scoped ? "fill-current" : ""}`}
                                  />
                                </button>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="models-menu-header">
                      <button
                        type="button"
                        className="models-more-button"
                        onClick={() => setShowAllModels((show) => !show)}
                      >
                        {showAllModels ? "scoped only" : "more"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {supportsThinkingLevel ? (
                <div className="relative">
                  <Badge
                    variant="secondary"
                    className="meta-chip cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => setThinkingMenuOpen((open) => !open)}
                  >
                    <Brain className="h-4 w-4 mr-1" /> {selectedThinking}{" "}
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Badge>
                  {thinkingMenuOpen ? (
                    <div
                      className="thinking-menu"
                      role="menu"
                      aria-label="Sélecteur de réflexion"
                    >
                      {availableThinkingLevels.map((level) => (
                        <button
                          key={level}
                          type="button"
                          className={`thinking-menu-item ${selectedThinking === level ? "thinking-menu-item-active" : ""}`}
                          onClick={() => void handleThinkingChange(level)}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {isStreaming && selectedConversation ? (
                <Button
                  type="button"
                  className="send-button"
                  variant="secondary"
                  onClick={() => void stopPi(selectedConversation.id)}
                >
                  <Square className="send-button-icon" />
                </Button>
              ) : null}

              <Button
                type="button"
                className={`send-button ${isPiGettingReady ? "send-button-getting-ready" : ""}`}
                onClick={() => void handleSendMessage()}
                disabled={isSendDisabled}
              >
                {isPiGettingReady ? (
                  <>
                    <Loader2 className="send-button-spinner animate-spin" />
                    <span className="send-button-status-text">Pi getting ready</span>
                  </>
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
