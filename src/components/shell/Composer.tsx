import { ArrowUp, ListOrdered, Loader2, Plus, Square } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { ComposerAttachments } from "@/components/shell/composer/ComposerAttachments";
import { ComposerAutocomplete } from "@/components/shell/composer/ComposerAutocomplete";
import { ComposerExtensionButtons } from "@/components/shell/composer/ComposerExtensionButtons";
import { FeatureMentionPopover } from "@/components/shell/composer/FeatureMentionPopover";
import { FileMentionPopover } from "@/components/shell/composer/FileMentionPopover";
import { ComposerModelControls } from "@/components/shell/composer/ComposerModelControls";
import { ComposerModificationsPanel } from "@/components/shell/composer/ComposerModificationsPanel";
import { ComposerQueue } from "@/components/shell/composer/ComposerQueue";
import { ComposerRequirementSheet } from "@/components/shell/composer/ComposerRequirementSheet";
import {
  buildAttachment,
  buildMessageWithAttachments,
  formatBytes,
} from "@/components/shell/composer/attachments";
import type { PendingAttachment } from "@/components/shell/composer/types";
import { useComposerDiffState } from "@/components/shell/composer/useComposerDiffState";
import { useComposerMentions } from "@/components/shell/composer/useComposerMentions";
import { useComposerMessaging } from "@/components/shell/composer/useComposerMessaging";
import { useComposerModelState } from "@/components/shell/composer/useComposerModelState";
import { useModelCache } from "@/components/shell/composer/useModelCache";
import { Button } from "@/components/ui/button";
import { useConversationSidePanel } from "@/hooks/use-conversation-side-panel";
import { useComposerAutocomplete } from "@/hooks/use-composer-autocomplete";
import { useComposerExtensionButtons } from "@/hooks/use-composer-extension-buttons";
import { useNotifications } from "@/features/notifications/NotificationContext";
import type { FileContent, ImageContent } from "@/features/workspace/rpc";
import { perfMonitor } from "@/features/workspace/store/perf-monitor";
import {
  usePiMessages,
  usePiRuntimeMeta,
} from "@/features/workspace/store/pi-store";
import { isHiddenFromConversationMessage } from "@/features/workspace/store/state";
import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";

export function Composer() {
  perfMonitor.recordComponentRender("Composer");

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
  const { setIsOpen: setSidePanelOpen } = useConversationSidePanel();

  const {
    models: cachedModels,
    configuredProviders,
    isLoadingModels,
    isRefreshingInBackground,
    refreshModelsForPicker,
  } = useModelCache();

  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const footerRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCursorToEndRef = useRef(false);
  const previousComposerKeyRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedConversation = state.conversations.find(
    (conversation) => conversation.id === state.selectedConversationId,
  );
  const selectedRuntime = usePiRuntimeMeta(selectedConversation?.id ?? null);
  const rawSelectedMessages = usePiMessages(selectedConversation?.id ?? null);
  const selectedMessages = rawSelectedMessages.filter(
    (message) => !isHiddenFromConversationMessage(message),
  );
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

  const {
    models,
    selectedModelKey,
    selectedThinking,
    selectedAccessMode,
    updatingModelKeys,
    accessModeTooltip,
    handleToggleModelScoped,
    handleApplyModel,
    handleThinkingChange,
    handleAccessModeChange,
  } = useComposerModelState({
    cachedModels,
    configuredProviders,
    selectedConversation: selectedConversation ?? null,
    selectedRuntime,
    conversations: state.conversations,
    refreshModelsForPicker,
    setPiModel,
    setPiThinkingLevel,
    setConversationAccessMode,
    notify: (message, type) => addNotification(message, type ?? "info"),
    t,
  });

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
    gitModifiedFiles,
    gitModificationTotals,
    showModificationsPanel,
    showModificationsList,
    hasInlineDiffOpen,
    openDiffPaths,
    diffLoadingByPath,
    diffErrorByPath,
    diffByPath,
    currentChangeIndexByPath,
    ensureGitBaselineForConversation,
    toggleModificationsPanel,
    handleToggleDiffForFile,
    scrollToChange,
    setDiffLineContainerRef,
    setFirstDiffChangeRef,
    setDiffChangeRef,
  } = useComposerDiffState({
    composerKey,
    selectedConversationId: selectedConversation?.id ?? null,
    isWorkingOnChanges,
  });

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
    ensureGitBaselineForConversation,
    requestConversationAutoTitle: (conversationId, messageToProcess) => {
      void workspaceIpc.requestConversationAutoTitle(
        conversationId,
        messageToProcess,
      );
    },
    sendPiPrompt,
    collapseSidePanel: () => setSidePanelOpen(false),
  });

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
    getCurrentModel: async () => null,
    getAvailableModels: async () => {
      return models.map((model) => ({
        provider: model.provider,
        id: model.id,
        name: `${model.provider} - ${model.id}`,
        capabilities: (model.supportsThinking ? ["thinking"] : []).concat(
          model.imageInput ? ["image-input"] : [],
        ),
      }));
    },
    accessMode: selectedAccessMode,
    notify: (title, body, type) =>
      addNotification(body ?? title, type ?? "info"),
    messages: selectedMessages,
    contextWindow: activeContextModel?.contextWindow,
  });

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

  const {
    fileMentionOpen,
    fileMentionQuery,
    fileMentionAnchor,
    featureMentionOpen,
    featureMentionQuery,
    featureMentionAnchor,
    autocompleteOpen,
    setAutocompleteOpen,
    handleComposerChange,
    handleFileMentionSelect,
    handleFileMentionClose,
    handleFeatureMentionSelect,
    handleFeatureMentionClose,
  } = useComposerMentions({
    message,
    setMessage,
    textareaRef,
    onAutocompleteRequest: (value, cursorPosition) => {
      requestAutocomplete(value, cursorPosition, selectedConversation?.id ?? null);
    },
    onAutocompleteClear: clearAutocompleteSuggestions,
    isAutocompleteAvailable,
  });

  useLayoutEffect(() => {
    const footer = footerRef.current;
    if (!footer) {
      return;
    }
    const mainPanel = footer.closest(".main-panel") as HTMLElement | null;
    if (!mainPanel) {
      return;
    }

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
    fileAttenteMessages.length,
    hasInlineDiffOpen,
    message,
    showModificationsList,
    showModificationsPanel,
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
      const customEvent = event as CustomEvent<{
        conversationId?: string;
        message?: string;
      }>;
      const payload = customEvent.detail;
      if (!payload?.conversationId || typeof payload.message !== "string") {
        return;
      }
      setMessageForKey(payload.conversationId, payload.message);
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

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    const computedStyles = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyles.lineHeight) || 20;
    const maxHeight = lineHeight * 6;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [message]);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (fileMentionOpen || featureMentionOpen) {
      return;
    }

    if (event.key === "Tab" && autocompleteOpen && autocompleteSuggestion) {
      event.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      const cursorPosition = textarea.selectionStart;
      const result = acceptAutocompleteSuggestion(
        message,
        autocompleteSuggestion,
        cursorPosition,
      );
      setMessage(result.newText);
      setAutocompleteOpen(false);
      clearAutocompleteSuggestions();

      requestAnimationFrame(() => {
        textarea.focus();
        const newPosition = Math.min(
          result.newCursorPosition,
          textarea.value.length,
        );
        textarea.setSelectionRange(newPosition, newPosition);
      });
      return;
    }

    if (event.key === "Enter" && event.shiftKey) {
      const isConversationBusy = Boolean(
        selectedRuntime?.status === "streaming" ||
          selectedRuntime?.status === "starting" ||
          selectedRuntime?.pendingUserMessage ||
          (selectedRuntime?.pendingCommands ?? 0) > 0,
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
        const finalMessage = buildMessageWithAttachments(
          messageToSend,
          pendingAttachments,
        );

        void sendPiPrompt({
          conversationId: selectedConversation.id,
          message: finalMessage,
          steer: true,
          images,
          files,
        });

        setMessage("");
        setPendingAttachmentsByKey((previous) => ({
          ...previous,
          [composerKey]: [],
        }));
      }
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void handleSendMessage();
  };

  const addFiles = async (files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    if (nextFiles.length === 0) {
      return;
    }

    const nextAttachments: PendingAttachment[] = [];
    for (const file of nextFiles) {
      try {
        const attachment = await buildAttachment(file);
        nextAttachments.push(attachment);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : `Impossible de lire ${file.name}.`;
        addNotification(errorMessage, "error");
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
    void addFiles(files);
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
    void addFiles(event.dataTransfer.files);
  };

  const isPiGettingReady = selectedRuntime?.status === "starting";
  const isProcessing = isAgentBusy || hasRpcInFlight;
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
              onTogglePanel={toggleModificationsPanel}
              onStopPi={(conversationId) => {
                void stopPi(conversationId);
              }}
              onToggleDiffForFile={handleToggleDiffForFile}
              onScrollToChange={scrollToChange}
              onSetDiffLineContainerRef={setDiffLineContainerRef}
              onSetFirstDiffChangeRef={setFirstDiffChangeRef}
              onSetDiffChangeRef={setDiffChangeRef}
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
                if (current === index) {
                  next = null;
                } else if (current !== null && current > index) {
                  next = current - 1;
                }
                return { ...previous, [composerKey]: next };
              });
            }}
            onSteer={async (item, index) => {
              if (
                selectedConversation?.id &&
                selectedRuntime?.status === "streaming"
              ) {
                try {
                  await sendPiPrompt({
                    conversationId: selectedConversation.id,
                    message: item,
                    steer: true,
                    images: [],
                    files: [],
                  });
                  setFileAttenteMessagesByKey((previous) => ({
                    ...previous,
                    [composerKey]: (previous[composerKey] ?? []).filter(
                      (_, currentIndex) => currentIndex !== index,
                    ),
                  }));
                } catch (error) {
                  console.error("Failed to steer message:", error);
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
            <FeatureMentionPopover
              isOpen={featureMentionOpen}
              query={featureMentionQuery}
              anchorRect={featureMentionAnchor}
              onSelect={handleFeatureMentionSelect}
              onClose={handleFeatureMentionClose}
              textareaRef={textareaRef}
            />
            {autocompleteOpen &&
            !fileMentionOpen &&
            !featureMentionOpen &&
            isAutocompleteAvailable &&
            autocompleteSuggestion ? (
              <div className="composer-autocomplete-inline-container">
                <ComposerAutocomplete
                  isVisible={true}
                  suggestion={autocompleteSuggestion}
                  currentText={message}
                  cursorPosition={textareaRef.current?.selectionStart ?? 0}
                  onAccept={() => {
                    const textarea = textareaRef.current;
                    if (!textarea || !autocompleteSuggestion) {
                      return;
                    }
                    const cursorPosition = textarea.selectionStart;
                    const result = acceptAutocompleteSuggestion(
                      message,
                      autocompleteSuggestion,
                      cursorPosition,
                    );
                    setMessage(result.newText);
                    clearAutocompleteSuggestions();
                    requestAnimationFrame(() => {
                      textarea.focus();
                      textarea.setSelectionRange(
                        result.newCursorPosition,
                        result.newCursorPosition,
                      );
                    });
                  }}
                  textareaRef={textareaRef}
                />
              </div>
            ) : null}
            <div className="composer-input-wrap">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded-full text-[#696b73] hover:text-[#374151] hover:bg-[#f3f4f6] transition-all duration-200 flex-shrink-0 self-center"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Ajouter des fichiers"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
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
            </div>

            <div className="composer-meta">
              <div className="flex items-center gap-1.5">
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
                {isRefreshingInBackground ? (
                  <div
                    className="composer-cache-status"
                    title="Rafraîchissement des modèles en arrière-plan"
                  >
                    <Loader2 className="composer-cache-spinner animate-spin h-4 w-4" />
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <ComposerExtensionButtons
                  buttons={getExtensionButtons().map((button) => ({
                    extensionId: button._extensionId || button.id,
                    button,
                  }))}
                  onClickButton={(_extensionId, button) =>
                    executeButtonAction(button.id)
                  }
                  disabled={isWorkingOnChanges}
                  contextUsage={contextUsage}
                  conversationId={selectedConversation?.id ?? null}
                  projectId={state.selectedProjectId}
                />
                {isProcessing && selectedConversation ? (
                  <Button
                    type="button"
                    className="stop-button send-button"
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
                    <Square className="send-button-icon icon-stop" />
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
                    isProcessing && !isSubmitting && message.trim().length > 0
                      ? "Ajouter à la file"
                      : undefined
                  }
                  title={
                    isProcessing && !isSubmitting && message.trim().length > 0
                      ? "Ajouter à la file"
                      : undefined
                  }
                >
                  {isProcessing || isSubmitting ? (
                    <ListOrdered className="send-button-icon icon-queue" />
                  ) : (
                    <ArrowUp className="send-button-icon icon-send" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </footer>
      {requirement ? (
        <ComposerRequirementSheet
          requirement={requirement}
          onDismiss={dismissRequirement}
          onConfirm={confirmRequirement}
        />
      ) : null}
    </>
  );
}
