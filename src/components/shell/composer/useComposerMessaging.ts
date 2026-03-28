import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ImageContent, FileContent } from "@/features/workspace/rpc";
import { usePiStore } from "@/features/workspace/store/pi-store";
import { workspaceIpc } from "@/services/ipc/workspace";
import { useMessageExpansion } from "@/hooks/useMessageExpansionContext";

import { buildMessageWithAttachments } from "./attachments";
import { parseModelKey, saveGlobalModel } from "./models";
import type { PendingAttachment, ThinkingLevel } from "./types";

type RuntimeSnapshot = {
  status?: string;
  pendingUserMessage?: boolean;
  pendingCommands?: number;
  state?:
    | {
        isStreaming?: boolean;
      }
    | null;
};

type UseComposerMessagingArgs = {
  composerKey: string;
  selectedProjectId: string | null;
  selectedConversationId: string | null;
  clearThreadActionSuggestions: (conversationId: string) => void;
  selectedModelKey: string;
  selectedThinking: ThinkingLevel;
  selectedAccessMode: "secure" | "open";
  selectedRuntime: RuntimeSnapshot | null;
  createConversationGlobal: (options: {
    modelProvider?: string;
    modelId?: string;
    thinkingLevel?: ThinkingLevel;
    accessMode?: "secure" | "open";
  }) => Promise<{ id: string } | null>;
  createConversationForProject: (
    projectId: string,
    options: {
      modelProvider?: string;
      modelId?: string;
      thinkingLevel?: ThinkingLevel;
      accessMode?: "secure" | "open";
    },
  ) => Promise<{ id: string } | null>;
  ensureGitBaselineForConversation: (conversationId: string) => Promise<void>;
  requestConversationAutoTitle: (conversationId: string, message: string) => void;
  sendPiPrompt: (args: { conversationId: string; message: string; images: ImageContent[]; files: FileContent[] }) => Promise<void>;
  collapseSidePanel?: () => void;
};

type UseComposerMessagingResult = {
  message: string;
  setMessage: (next: string) => void;
  setMessageForKey: (key: string, value: string) => void;
  pendingAttachments: PendingAttachment[];
  setPendingAttachmentsByKey: React.Dispatch<React.SetStateAction<Record<string, PendingAttachment[]>>>;
  fileAttenteMessages: string[];
  setFileAttenteMessagesByKey: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  indexEditionFileAttente: number | null;
  setIndexEditionFileAttenteByKey: React.Dispatch<React.SetStateAction<Record<string, number | null>>>;
  isSubmitting: boolean;
  handleSendMessage: () => Promise<void>;
};

export function useComposerMessaging({
  composerKey,
  selectedProjectId,
  selectedConversationId,
  clearThreadActionSuggestions,
  selectedModelKey,
  selectedThinking,
  selectedAccessMode,
  selectedRuntime,
  createConversationGlobal,
  createConversationForProject,
  ensureGitBaselineForConversation,
  requestConversationAutoTitle,
  sendPiPrompt,
  collapseSidePanel,
}: UseComposerMessagingArgs): UseComposerMessagingResult {
  const [draftsByKey, setDraftsByKey] = useState<Record<string, string>>({});

  // Subscribe directly to the piStore for queue drain decisions.
  // This avoids depending on the parent re-render cycle to propagate
  // runtime changes — the external store subscription fires immediately
  // when the runtime transitions (e.g. agent_end), ensuring the drain
  // useEffect re-evaluates without delay.
  const runtimeIdle = usePiStore((s) => {
    if (!selectedConversationId) return true;
    const rt = s.piByConversation[selectedConversationId];
    if (!rt) return true;
    return (
      !rt.state?.isStreaming &&
      rt.status !== "streaming" &&
      rt.status !== "starting" &&
      !rt.pendingUserMessage &&
      (rt.pendingCommands ?? 0) === 0
    );
  });
  const [pendingAttachmentsByKey, setPendingAttachmentsByKey] = useState<Record<string, PendingAttachment[]>>({});
  const [fileAttenteMessagesByKey, setFileAttenteMessagesByKey] = useState<Record<string, string[]>>({});
  const [indexEditionFileAttenteByKey, setIndexEditionFileAttenteByKey] = useState<Record<string, number | null>>({});
  const [envoiFileAttenteEnCoursByKey, setEnvoiFileAttenteEnCoursByKey] = useState<Record<string, boolean>>({});
  const [isSubmittingByKey, setIsSubmittingByKey] = useState<Record<string, boolean>>({});
  const draftsLoadedRef = useRef(false);
  const queuedMessagesLoadedRef = useRef(false);

  // Load drafts from database on mount
  useEffect(() => {
    if (draftsLoadedRef.current) return;
    draftsLoadedRef.current = true;

    const loadDrafts = async () => {
      try {
        const result = await workspaceIpc.getAllDrafts();
        if (result.ok && result.drafts) {
          setDraftsByKey(result.drafts);
        }
      } catch (error) {
        console.error("Failed to load drafts:", error);
      }
    };

    void loadDrafts();
  }, []);

  useEffect(() => {
    if (queuedMessagesLoadedRef.current) return;
    queuedMessagesLoadedRef.current = true;

    const loadQueuedMessages = async () => {
      try {
        const result = await workspaceIpc.getAllQueuedMessages();
        if (result.ok && result.queuedMessages) {
          setFileAttenteMessagesByKey(result.queuedMessages);
        }
      } catch (error) {
        console.error("Failed to load queued composer messages:", error);
      }
    };

    void loadQueuedMessages();
  }, []);

  const message = useMemo(() => draftsByKey[composerKey] ?? "", [composerKey, draftsByKey]);
  const pendingAttachments = useMemo(
    () => pendingAttachmentsByKey[composerKey] ?? [],
    [composerKey, pendingAttachmentsByKey],
  );
  const fileAttenteMessages = useMemo(
    () => fileAttenteMessagesByKey[composerKey] ?? [],
    [composerKey, fileAttenteMessagesByKey],
  );
  const indexEditionFileAttente = useMemo(
    () => indexEditionFileAttenteByKey[composerKey] ?? null,
    [composerKey, indexEditionFileAttenteByKey],
  );
  const envoiFileAttenteEnCours = useMemo(
    () => envoiFileAttenteEnCoursByKey[composerKey] ?? false,
    [composerKey, envoiFileAttenteEnCoursByKey],
  );
  const isSubmitting = useMemo(
    () => isSubmittingByKey[composerKey] ?? false,
    [composerKey, isSubmittingByKey],
  );

  const setMessage = useCallback(
    (next: string) => {
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
    },
    [composerKey],
  );

  const clearCurrentDraft = useCallback(() => {
    setDraftsByKey((previous) => {
      if (!(composerKey in previous)) {
        return previous;
      }
      const updated = { ...previous };
      delete updated[composerKey];
      return updated;
    });
  }, [composerKey]);

  // Debounced draft persistence (150ms)
  const draftSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const currentMessage = draftsByKey[composerKey] ?? "";

    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }

    if (currentMessage.length === 0) {
      // Don't save empty drafts immediately, but delete after debounce
      draftSaveTimerRef.current = setTimeout(() => {
        void workspaceIpc.deleteDraft(composerKey);
      }, 150);
    } else {
      draftSaveTimerRef.current = setTimeout(() => {
        void workspaceIpc.saveDraft(composerKey, currentMessage);
      }, 150);
    }

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [composerKey, draftsByKey]);

  const queuedMessagesSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const currentQueuedMessages = fileAttenteMessagesByKey[composerKey] ?? [];

    if (queuedMessagesSaveTimerRef.current) {
      clearTimeout(queuedMessagesSaveTimerRef.current);
    }

    queuedMessagesSaveTimerRef.current = setTimeout(() => {
      if (currentQueuedMessages.length === 0) {
        void workspaceIpc.deleteQueuedMessages(composerKey);
      } else {
        void workspaceIpc.saveQueuedMessages(composerKey, currentQueuedMessages);
      }
    }, 150);

    return () => {
      if (queuedMessagesSaveTimerRef.current) {
        clearTimeout(queuedMessagesSaveTimerRef.current);
      }
    };
  }, [composerKey, fileAttenteMessagesByKey]);

  const { collapseAllMessages } = useMessageExpansion()
  const envoyerMessage = useCallback(
    async (messageATraiter: string, piecesJointes: PendingAttachment[] = []) => {
      let conversationId = selectedConversationId;
      let shouldRequestAutoTitle = Boolean(selectedConversationId);

      if (!conversationId) {
        const parsedModel = parseModelKey(selectedModelKey);
        const createdConversation = selectedProjectId
          ? await createConversationForProject(selectedProjectId, {
              modelProvider: parsedModel?.provider,
              modelId: parsedModel?.modelId,
              thinkingLevel: selectedThinking,
              accessMode: selectedAccessMode,
            })
          : await createConversationGlobal({
              modelProvider: parsedModel?.provider,
              modelId: parsedModel?.modelId,
              thinkingLevel: selectedThinking,
              accessMode: selectedAccessMode,
            });
        if (!createdConversation) {
          return false;
        }
        conversationId = createdConversation.id;
        shouldRequestAutoTitle = true;
      }

      if (conversationId) {
        void ensureGitBaselineForConversation(conversationId).catch(() => undefined);
        clearThreadActionSuggestions(conversationId);
      }

      if (shouldRequestAutoTitle && conversationId) {
        requestConversationAutoTitle(conversationId, messageATraiter);
      }
      const images = piecesJointes
        .map((piece) => piece.image)
        .filter((piece): piece is ImageContent => Boolean(piece));
      const files = piecesJointes
        .map((piece) => piece.file)
        .filter((piece): piece is FileContent => Boolean(piece));
      const messageFinal = buildMessageWithAttachments(messageATraiter, piecesJointes);
      await sendPiPrompt({ conversationId: conversationId!, message: messageFinal, images, files });
      saveGlobalModel(selectedModelKey);
      
      // Collapse all expanded messages after sending a new message
      collapseAllMessages();
      
      return true;
    },
    [
      createConversationForProject,
      createConversationGlobal,
      ensureGitBaselineForConversation,
      requestConversationAutoTitle,
      selectedAccessMode,
      selectedConversationId,
      selectedModelKey,
      selectedProjectId,
      selectedThinking,
      sendPiPrompt,
      clearThreadActionSuggestions,
      collapseAllMessages,
    ],
  );

  const handleSendMessage = useCallback(async () => {
    const nextMessage = message.trim();
    const isPiGettingReady = selectedRuntime?.status === "starting";
    if (!nextMessage && pendingAttachments.length === 0) {
      return;
    }

    const isPiOccupe = Boolean(
      selectedRuntime?.state?.isStreaming ||
        selectedRuntime?.status === "streaming" ||
        isPiGettingReady ||
        selectedRuntime?.pendingUserMessage ||
        isSubmitting, // treat in-flight IPC send as busy so messages are queued, not dropped
    );

    if (isPiOccupe) {
      const queuedMessage = buildMessageWithAttachments(nextMessage, pendingAttachments);
      if (indexEditionFileAttente !== null) {
        setFileAttenteMessagesByKey((previous) => ({
          ...previous,
          [composerKey]: (previous[composerKey] ?? []).map((item, index) =>
            index === indexEditionFileAttente ? queuedMessage : item,
          ),
        }));
        setIndexEditionFileAttenteByKey((previous) => ({
          ...previous,
          [composerKey]: null,
        }));
      } else {
        setFileAttenteMessagesByKey((previous) => ({
          ...previous,
          [composerKey]: [...(previous[composerKey] ?? []), queuedMessage],
        }));
      }
      clearCurrentDraft();
      setPendingAttachmentsByKey((previous) => ({ ...previous, [composerKey]: [] }));
      return;
    }

    // Collapse side panel when actually sending a message rather than queueing it.
    collapseSidePanel?.();

    const attachmentsToSend = pendingAttachments;
    clearCurrentDraft();
    setPendingAttachmentsByKey((previous) => ({ ...previous, [composerKey]: [] }));
    setIsSubmittingByKey((previous) => ({ ...previous, [composerKey]: true }));
    try {
      const ok = await envoyerMessage(nextMessage, attachmentsToSend);
      if (!ok) {
        setMessage(nextMessage);
        setPendingAttachmentsByKey((previous) => ({
          ...previous,
          [composerKey]: attachmentsToSend,
        }));
      }
    } finally {
      setIsSubmittingByKey((previous) => ({ ...previous, [composerKey]: false }));
    }
  }, [
    clearCurrentDraft,
    composerKey,
    collapseSidePanel,
    envoyerMessage,
    indexEditionFileAttente,
    isSubmitting,
    message,
    pendingAttachments,
    selectedRuntime?.pendingUserMessage,
    selectedRuntime?.state?.isStreaming,
    selectedRuntime?.status,
    setMessage
  ]);

  // When a new conversation is created (composerKey transitions from a draft key
  // to a real conversation ID), migrate any queued messages from the old key so
  // they are not orphaned.
  const previousComposerKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const previousKey = previousComposerKeyRef.current;
    previousComposerKeyRef.current = composerKey;

    if (!previousKey || previousKey === composerKey) {
      return;
    }

    // Only migrate when going from a draft/global key → a real conversation ID.
    const isDraftKey = previousKey === "global" || previousKey.startsWith("draft:");
    if (!isDraftKey) {
      return;
    }

    setFileAttenteMessagesByKey((previous) => {
      const orphaned = previous[previousKey];
      if (!orphaned || orphaned.length === 0) {
        return previous;
      }
      const updated = { ...previous };
      delete updated[previousKey];
      updated[composerKey] = [...(updated[composerKey] ?? []), ...orphaned];
      return updated;
    });

    setEnvoiFileAttenteEnCoursByKey((previous) => {
      if (!previous[previousKey]) {
        return previous;
      }
      const updated = { ...previous };
      delete updated[previousKey];
      return updated;
    });
  }, [composerKey]);

  // Stable reference to envoyerMessage to prevent queue effect from re-triggering
  // when envoyerMessage dependencies change
  const envoyerMessageRef = useRef(envoyerMessage);
  useEffect(() => {
    envoyerMessageRef.current = envoyerMessage;
  }, [envoyerMessage]);

  useEffect(() => {
    if (fileAttenteMessages.length === 0) {
      return;
    }
    if (envoiFileAttenteEnCours) {
      return;
    }

    const isPiOccupe = Boolean(
      selectedRuntime?.state?.isStreaming ||
        selectedRuntime?.status === "streaming" ||
        selectedRuntime?.pendingUserMessage ||
        selectedRuntime?.status === "starting" ||
        (selectedRuntime?.pendingCommands ?? 0) > 0,
    );
    if (isPiOccupe) {
      return;
    }

    const messageSuivant = fileAttenteMessages[0]?.trim();
    if (!messageSuivant) {
      setFileAttenteMessagesByKey((previous) => ({
        ...previous,
        [composerKey]: (previous[composerKey] ?? []).slice(1),
      }));
      return;
    }

    // Remove the message from the queue immediately so it disappears from
    // the UI as soon as it is sent, rather than waiting for the full
    // execution to complete.
    setFileAttenteMessagesByKey((previous) => ({
      ...previous,
      [composerKey]: (previous[composerKey] ?? []).slice(1),
    }));
    setEnvoiFileAttenteEnCoursByKey((previous) => ({
      ...previous,
      [composerKey]: true,
    }));
    setIsSubmittingByKey((previous) => ({ ...previous, [composerKey]: true }));
    void envoyerMessageRef.current(messageSuivant)
      .catch((error) => {
        console.error('Error sending queued message:', error);
      })
      .finally(() => {
        setEnvoiFileAttenteEnCoursByKey((previous) => ({
          ...previous,
          [composerKey]: false,
        }));
        setIsSubmittingByKey((previous) => ({ ...previous, [composerKey]: false }));
      });
  }, [
    composerKey,
    envoiFileAttenteEnCours,
    fileAttenteMessages,
    runtimeIdle,
    selectedRuntime?.pendingUserMessage,
    selectedRuntime?.state?.isStreaming,
    selectedRuntime?.status,
    selectedRuntime?.pendingCommands,
  ]);


  return useMemo(
    () => ({
      message,
      setMessage,
      setMessageForKey: (key: string, value: string) => {
        setDraftsByKey((previous) => ({ ...previous, [key]: value }));
      },
      pendingAttachments,
      setPendingAttachmentsByKey,
      fileAttenteMessages,
      setFileAttenteMessagesByKey,
      indexEditionFileAttente,
      setIndexEditionFileAttenteByKey,
      isSubmitting,
      handleSendMessage,
    }),
    [
      fileAttenteMessages,
      handleSendMessage,
      indexEditionFileAttente,
      isSubmitting,
      message,
      pendingAttachments,
      setMessage,
    ],
  );
}
