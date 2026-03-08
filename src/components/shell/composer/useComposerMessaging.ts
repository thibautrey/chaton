import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ImageContent, FileContent } from "@/features/workspace/rpc";
import { workspaceIpc } from "@/services/ipc/workspace";

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
  setNotice: (notice: string | null) => void;
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
  setPiThinkingLevel: (conversationId: string, level: ThinkingLevel) => Promise<{ success: boolean; error?: string }>;
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
  setNotice,
  createConversationGlobal,
  createConversationForProject,
  ensureGitBaselineForConversation,
  setPiThinkingLevel,
  requestConversationAutoTitle,
  sendPiPrompt,
  collapseSidePanel,
}: UseComposerMessagingArgs): UseComposerMessagingResult {
  const [draftsByKey, setDraftsByKey] = useState<Record<string, string>>({});
  const [pendingAttachmentsByKey, setPendingAttachmentsByKey] = useState<Record<string, PendingAttachment[]>>({});
  const [fileAttenteMessagesByKey, setFileAttenteMessagesByKey] = useState<Record<string, string[]>>({});
  const [indexEditionFileAttenteByKey, setIndexEditionFileAttenteByKey] = useState<Record<string, number | null>>({});
  const [envoiFileAttenteEnCoursByKey, setEnvoiFileAttenteEnCoursByKey] = useState<Record<string, boolean>>({});
  const [isSubmittingByKey, setIsSubmittingByKey] = useState<Record<string, boolean>>({});
  const draftsLoadedRef = useRef(false);

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
        await ensureGitBaselineForConversation(conversationId);

        const setThinkingResponse = await setPiThinkingLevel(conversationId, selectedThinking);
        if (!setThinkingResponse.success) {
          setNotice(setThinkingResponse.error ?? "Impossible de changer le niveau de réflexion.");
        }
      }

      if (conversationId) {
        await ensureGitBaselineForConversation(conversationId);
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
      setNotice,
      setPiThinkingLevel,
    ],
  );

  const handleSendMessage = useCallback(async () => {
    const nextMessage = message.trim();
    const isPiGettingReady = selectedRuntime?.status === "starting";
    if (!nextMessage && pendingAttachments.length === 0) {
      return;
    }

    // Collapse side panel when user sends a new message
    collapseSidePanel?.();

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
    setMessage,
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

    setEnvoiFileAttenteEnCoursByKey((previous) => ({
      ...previous,
      [composerKey]: true,
    }));
    setIsSubmittingByKey((previous) => ({ ...previous, [composerKey]: true }));
    void envoyerMessageRef.current(messageSuivant)
      .then(() => {
        // Always remove from queue after send attempt (success or failure)
        // If the send failed, envoyerMessage() already restored the message to draft
        setFileAttenteMessagesByKey((previous) => ({
          ...previous,
          [composerKey]: (previous[composerKey] ?? []).slice(1),
        }));
      })
      .catch((error) => {
        // Even on error, remove from queue (the message stays as draft)
        console.error('Error sending queued message:', error);
        setFileAttenteMessagesByKey((previous) => ({
          ...previous,
          [composerKey]: (previous[composerKey] ?? []).slice(1),
        }));
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
