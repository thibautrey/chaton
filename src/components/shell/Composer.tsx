import {
  ArrowUp,
  Brain,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Square,
  Star,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ImageContent, JsonValue } from "@/features/workspace/rpc";
import { useWorkspace } from "@/features/workspace/store";
import type { Conversation } from "@/features/workspace/types";
import { workspaceIpc } from "@/services/ipc/workspace";

const THINKING_LEVELS: Array<
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
> = ["off", "minimal", "low", "medium", "high", "xhigh"];

const MAX_TEXT_FILE_BYTES = 200_000;
const MAX_BINARY_PREVIEW_BYTES = 100_000;

type PendingAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  image?: ImageContent;
  textForPrompt: string;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Résultat de lecture invalide."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Impossible de lire le fichier."));
    };
    reader.readAsDataURL(file);
  });
}

async function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Résultat texte invalide."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Impossible de lire le texte."));
    };
    reader.readAsText(file);
  });
}

async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("Résultat binaire invalide."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Impossible de lire le binaire."));
    };
    reader.readAsArrayBuffer(file);
  });
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function buildAttachment(file: File): Promise<PendingAttachment> {
  const mimeType = file.type || "application/octet-stream";
  const isImage = mimeType.startsWith("image/");
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  if (isImage) {
    const dataUrl = await fileToDataUrl(file);
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex < 0) {
      throw new Error(`Image invalide: ${file.name}`);
    }
    const base64Data = dataUrl.slice(commaIndex + 1);
    return {
      id,
      name: file.name,
      mimeType,
      size: file.size,
      isImage: true,
      image: {
        type: "image",
        data: base64Data,
        mimeType,
      },
      textForPrompt: `Nom: ${file.name}\nType: ${mimeType}\nTaille: ${formatBytes(file.size)}`,
    };
  }

  const seemsText =
    mimeType.startsWith("text/") ||
    /json|xml|yaml|csv|markdown|javascript|typescript|html|css/.test(mimeType);

  if (seemsText && file.size <= MAX_TEXT_FILE_BYTES) {
    const text = await fileToText(file);
    return {
      id,
      name: file.name,
      mimeType,
      size: file.size,
      isImage: false,
      textForPrompt: `Nom: ${file.name}\nType: ${mimeType}\nTaille: ${formatBytes(file.size)}\nContenu:\n${text}`,
    };
  }

  const buffer = await fileToArrayBuffer(file);
  const truncated = buffer.byteLength > MAX_BINARY_PREVIEW_BYTES;
  const previewBuffer = truncated ? buffer.slice(0, MAX_BINARY_PREVIEW_BYTES) : buffer;
  const previewBase64 = toBase64(previewBuffer);
  return {
    id,
    name: file.name,
    mimeType,
    size: file.size,
    isImage: false,
    textForPrompt: `Nom: ${file.name}\nType: ${mimeType}\nTaille: ${formatBytes(file.size)}\nAperçu base64${truncated ? " (tronqué)" : ""}:\n${previewBase64}`,
  };
}

const CLE_MODELE_GLOBAL = "dashboard:modele-pi-global";

function lireModeleGlobalSauvegarde(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const valeur = window.localStorage.getItem(CLE_MODELE_GLOBAL);
  return valeur && valeur.includes("/") ? valeur : null;
}

function sauvegarderModeleGlobal(modele: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CLE_MODELE_GLOBAL, modele);
}

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

function trouverDernierModeleConversation(conversations: Conversation[]): string | null {
  const tri = [...conversations].sort((a, b) =>
    (b.lastMessageAt || b.updatedAt).localeCompare(a.lastMessageAt || a.updatedAt),
  );
  const conversationAvecModele = tri.find(
    (conversation) => conversation.modelProvider && conversation.modelId,
  );
  if (!conversationAvecModele?.modelProvider || !conversationAvecModele.modelId) {
    return null;
  }
  return `${conversationAvecModele.modelProvider}/${conversationAvecModele.modelId}`;
}

type ModifiedFileStat = {
  path: string;
  added: number;
  removed: number;
};

function extractText(value: JsonValue): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return value.map((item) => extractText(item)).filter(Boolean).join("\n");
  const record = value as Record<string, JsonValue>;
  if (typeof record.text === "string") return record.text;
  if (record.content) return extractText(record.content);
  if (record.message) return extractText(record.message);
  return "";
}

function parseUnifiedDiff(text: string): ModifiedFileStat[] {
  if (!text.includes("diff --git") && !text.includes("@@")) return [];
  const files = new Map<string, ModifiedFileStat>();
  const lines = text.split("\n");
  let currentPath: string | null = null;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      currentPath = match?.[2] ?? match?.[1] ?? null;
      if (currentPath && !files.has(currentPath)) {
        files.set(currentPath, { path: currentPath, added: 0, removed: 0 });
      }
      continue;
    }
    if (line.startsWith("+++ b/")) {
      currentPath = line.slice("+++ b/".length).trim() || currentPath;
      if (currentPath && !files.has(currentPath)) {
        files.set(currentPath, { path: currentPath, added: 0, removed: 0 });
      }
      continue;
    }
    if (!currentPath) continue;
    const stat = files.get(currentPath);
    if (!stat) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) stat.added += 1;
    if (line.startsWith("-") && !line.startsWith("---")) stat.removed += 1;
  }
  return Array.from(files.values());
}

function collectToolResultTexts(messages: JsonValue[]): string[] {
  const texts: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) continue;
    const root = message as Record<string, JsonValue>;
    const nested =
      root.message && typeof root.message === "object" && !Array.isArray(root.message)
        ? (root.message as Record<string, JsonValue>)
        : null;
    const source = nested ?? root;
    if (source.role === "toolResult") {
      const text = extractText(source.content) || extractText(source.result);
      if (text) texts.push(text);
      continue;
    }
    const content = Array.isArray(source.content) ? source.content : null;
    if (!content) continue;
    for (const item of content) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const part = item as Record<string, JsonValue>;
      if (part.type !== "toolResult") continue;
      const text = extractText(part.content) || extractText(part.result);
      if (text) texts.push(text);
    }
  }
  return texts;
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
    () => lireModeleGlobalSauvegarde() ?? "openai-codex/gpt-5.3-codex",
  );
  const [selectedThinking, setSelectedThinking] = useState<
    "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  >("medium");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isUpdatingScope, setIsUpdatingScope] = useState(false);
  const [isSubmittingByKey, setIsSubmittingByKey] = useState<
    Record<string, boolean>
  >({});
  const [isModificationsExpanded, setIsModificationsExpanded] = useState(false);
  const [pendingAttachmentsByKey, setPendingAttachmentsByKey] = useState<
    Record<string, PendingAttachment[]>
  >({});
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const [fileAttenteMessagesByKey, setFileAttenteMessagesByKey] = useState<
    Record<string, string[]>
  >({});
  const [indexEditionFileAttenteByKey, setIndexEditionFileAttenteByKey] =
    useState<Record<string, number | null>>({});
  const [envoiFileAttenteEnCoursByKey, setEnvoiFileAttenteEnCoursByKey] =
    useState<Record<string, boolean>>({});
  const backgroundSyncRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previousComposerKeyRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menusRef = useRef<HTMLDivElement | null>(null);
  const modelsMenuRef = useRef<HTMLDivElement | null>(null);
  const thinkingMenuRef = useRef<HTMLDivElement | null>(null);
  const modelsMenuListRef = useRef<HTMLDivElement | null>(null);
  const modelsMenuListContentRef = useRef<HTMLDivElement | null>(null);
  const [modelsMenuListHeight, setModelsMenuListHeight] = useState(0);
  const dernierModelUtiliseRef = useRef<string | null>(
    lireModeleGlobalSauvegarde(),
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
  const message = draftsByKey[composerKey] ?? "";
  const pendingAttachments = pendingAttachmentsByKey[composerKey] ?? [];
  const fileAttenteMessages = fileAttenteMessagesByKey[composerKey] ?? [];
  const indexEditionFileAttente =
    indexEditionFileAttenteByKey[composerKey] ?? null;
  const envoiFileAttenteEnCours =
    envoiFileAttenteEnCoursByKey[composerKey] ?? false;
  const isSubmitting = isSubmittingByKey[composerKey] ?? false;
  const isWorkingOnChanges = Boolean(
    selectedRuntime?.status === "streaming" ||
      selectedRuntime?.status === "starting" ||
      selectedRuntime?.pendingUserMessage,
  );
  const modifiedFiles = useMemo(() => {
    const statsByPath = new Map<string, ModifiedFileStat>();
    const texts = collectToolResultTexts(selectedRuntime?.messages ?? []);
    for (const text of texts) {
      for (const stat of parseUnifiedDiff(text)) {
        statsByPath.set(stat.path, stat);
      }
    }
    return Array.from(statsByPath.values());
  }, [selectedRuntime?.messages]);
  const modificationTotals = useMemo(
    () =>
      modifiedFiles.reduce(
        (acc, file) => ({ added: acc.added + file.added, removed: acc.removed + file.removed }),
        { added: 0, removed: 0 },
      ),
    [modifiedFiles],
  );
  const showModificationsPanel = modifiedFiles.length > 0;
  const showModificationsList = isWorkingOnChanges || isModificationsExpanded;

  useEffect(() => {
    const previousKey = previousComposerKeyRef.current;
    previousComposerKeyRef.current = composerKey;
    if (previousKey === null || previousKey === composerKey) {
      return;
    }
    if (!state.selectedProjectId) {
      return;
    }
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [composerKey, state.selectedProjectId]);

  useEffect(() => {
    if (isWorkingOnChanges) {
      setIsModificationsExpanded(true);
    }
  }, [isWorkingOnChanges]);

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

  const effacerBrouillonCourant = () => {
    setDraftsByKey((previous) => {
      if (!(composerKey in previous)) {
        return previous;
      }
      const updated = { ...previous };
      delete updated[composerKey];
      return updated;
    });
  };

  const construireMessageAvecPiecesJointes = (
    messageATraiter: string,
    piecesJointes: PendingAttachment[],
  ): string => {
    if (piecesJointes.length === 0) {
      return messageATraiter;
    }
    const sections = piecesJointes.map((piece, index) => {
      return `--- Pièce jointe ${index + 1} ---\n${piece.textForPrompt}`;
    });
    return `${messageATraiter}\n\n${sections.join("\n\n")}`;
  };

  const envoyerMessage = async (
    messageATraiter: string,
    piecesJointes: PendingAttachment[] = [],
  ) => {
    let conversationId = selectedConversation?.id;
    let shouldRequestAutoTitle = Boolean(selectedConversation);

    if (!conversationId) {
      if (!state.selectedProjectId) {
        setNotice("Sélectionnez un projet pour démarrer un fil.");
        return false;
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
        return false;
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

    const images = piecesJointes
      .map((piece) => piece.image)
      .filter((piece): piece is ImageContent => Boolean(piece));
    const messageFinal = construireMessageAvecPiecesJointes(messageATraiter, piecesJointes);
    await sendPiPrompt({ conversationId, message: messageFinal, images });
    dernierModelUtiliseRef.current = selectedModelKey;
    sauvegarderModeleGlobal(selectedModelKey);
    if (shouldRequestAutoTitle) {
      void workspaceIpc.requestConversationAutoTitle(conversationId, messageATraiter);
    }
    return true;
  };

  const handleSendMessage = async () => {
    const nextMessage = message.trim();
    const isPiGettingReady = selectedRuntime?.status === "starting";
    if ((!nextMessage && pendingAttachments.length === 0) || isSubmitting) {
      return;
    }

    const isPiOccupe = Boolean(
      selectedRuntime?.state?.isStreaming ||
      selectedRuntime?.status === "streaming" ||
      isPiGettingReady ||
      selectedRuntime?.pendingUserMessage,
    );

    if (isPiOccupe) {
      const queuedMessage = construireMessageAvecPiecesJointes(
        nextMessage,
        pendingAttachments,
      );
      if (indexEditionFileAttente !== null) {
        setFileAttenteMessagesByKey((previous) => ({
          ...previous,
          [composerKey]: fileAttenteMessages.map((item, index) =>
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
      effacerBrouillonCourant();
      setPendingAttachmentsByKey((previous) => ({ ...previous, [composerKey]: [] }));
      return;
    }

    const attachmentsToSend = pendingAttachments;
    effacerBrouillonCourant();
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
        const modeleSauvegarde =
          dernierModelUtiliseRef.current ??
          lireModeleGlobalSauvegarde();
        const modeleExistant =
          (modeleSauvegarde
            ? result.models.find((model) => model.key === modeleSauvegarde)
            : null) ?? null;
        const scoped = result.models.filter((model) => model.scoped);
        const defaultModel = modeleExistant ?? scoped[0] ?? result.models[0];
        if (defaultModel) {
          setSelectedModelKey(defaultModel.key);
          dernierModelUtiliseRef.current = defaultModel.key;
          sauvegarderModeleGlobal(defaultModel.key);
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
        const modeleSauvegarde =
          dernierModelUtiliseRef.current ??
          lireModeleGlobalSauvegarde() ??
          trouverDernierModeleConversation(state.conversations);
        const fallback =
          (modeleSauvegarde
            ? result.models.find((model) => model.key === modeleSauvegarde)
            : null) ??
          result.models.find((model) => model.scoped) ??
          result.models[0];
        if (fallback) {
          dernierModelUtiliseRef.current = fallback.key;
          sauvegarderModeleGlobal(fallback.key);
          return fallback.key;
        }
        return current;
      });
    });
  }, [state.conversations, state.selectedConversationId, state.selectedProjectId]);

  useEffect(() => {
    const handleWindowClick = (event: MouseEvent) => {
      if (!menusRef.current) return;
      if (menusRef.current.contains(event.target as Node)) return;
      setModelsMenuOpen(false);
      setShowAllModels(false);
      setThinkingMenuOpen(false);
    };

    window.addEventListener("mousedown", handleWindowClick);
    return () => window.removeEventListener("mousedown", handleWindowClick);
  }, []);

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
      lireModeleGlobalSauvegarde() ??
      trouverDernierModeleConversation(state.conversations);

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
      sauvegarderModeleGlobal(modeleActif);
    }

    if (selectedConversation?.thinkingLevel) {
      const level =
        selectedConversation.thinkingLevel as typeof selectedThinking;
      if (THINKING_LEVELS.includes(level)) {
        setSelectedThinking(level);
      }
    }
  }, [models, selectedConversation, selectedRuntime?.state?.model, selectedRuntime?.status, state.conversations]);

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
      selectedRuntime?.status === "starting",
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
    void envoyerMessage(messageSuivant)
      .then((ok) => {
        if (ok) {
          setFileAttenteMessagesByKey((previous) => ({
            ...previous,
            [composerKey]: (previous[composerKey] ?? []).slice(1),
          }));
        }
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
  ]);

  const isStreaming = Boolean(
    selectedRuntime?.state?.isStreaming ||
    selectedRuntime?.status === "streaming",
  );
  const isPiGettingReady = selectedRuntime?.status === "starting";
  const isProcessing =
    isStreaming || isPiGettingReady || Boolean(selectedRuntime?.pendingUserMessage);
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

        {showModificationsPanel ? (
          <div className="composer-mods-panel" role="status" aria-live="polite">
            <div className="composer-mods-header">
              <div className="composer-mods-title">
                {modifiedFiles.length} {modifiedFiles.length > 1 ? "fichiers modifies" : "fichier modifie"}{" "}
                <span className="chat-inline-diff-plus">+{modificationTotals.added}</span>{" "}
                <span className="chat-inline-diff-minus">-{modificationTotals.removed}</span>
              </div>
              {isWorkingOnChanges && selectedConversation ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="composer-mods-action"
                  onClick={() => void stopPi(selectedConversation.id)}
                >
                  Annuler
                </Button>
              ) : (
                <button
                  type="button"
                  className="composer-mods-action"
                  onClick={() => setIsModificationsExpanded((current) => !current)}
                >
                  Verifier modifications
                </button>
              )}
            </div>
            {showModificationsList ? (
              <div className="composer-mods-list">
                {modifiedFiles.slice(0, 12).map((file) => (
                  <div key={file.path} className="composer-mods-row">
                    <span className="composer-mods-path">{file.path}</span>
                    <span className="composer-mods-counts">
                      <span className="chat-inline-diff-plus">+{file.added}</span>
                      <span className="chat-inline-diff-minus">-{file.removed}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {fileAttenteMessages.length > 0 ? (
          <div className="composer-file-attente" role="status" aria-live="polite">
            <div className="composer-file-attente-titre">
              File d’attente ({fileAttenteMessages.length})
            </div>
            <div className="composer-file-attente-liste">
              {fileAttenteMessages.map((item, index) => (
                <div key={`${index}-${item}`} className="composer-file-attente-item">
                  <div className="composer-file-attente-texte">{item}</div>
                  <div className="composer-file-attente-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      className="composer-file-attente-bouton"
                      onClick={() => {
                        setMessage(item);
                        setIndexEditionFileAttenteByKey((previous) => ({
                          ...previous,
                          [composerKey]: index,
                        }));
                        textareaRef.current?.focus();
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="composer-file-attente-bouton"
                      onClick={() => {
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
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

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
          {pendingAttachments.length > 0 ? (
            <div className="composer-attachments" aria-live="polite">
              {pendingAttachments.map((piece) => (
                piece.isImage && piece.image ? (
                  <div key={piece.id} className="composer-image-preview">
                    <img
                      className="composer-image-preview-thumb"
                      src={`data:${piece.image.mimeType};base64,${piece.image.data}`}
                      alt={piece.name}
                    />
                    <div className="composer-image-preview-meta">
                      <span className="composer-image-preview-name">{piece.name}</span>
                      <span className="composer-image-preview-size">{formatBytes(piece.size)}</span>
                    </div>
                    <button
                      type="button"
                      className="composer-attachment-chip-remove composer-image-preview-remove"
                      onClick={() =>
                        setPendingAttachmentsByKey((previous) => ({
                          ...previous,
                          [composerKey]: (previous[composerKey] ?? []).filter(
                            (item) => item.id !== piece.id,
                          ),
                        }))
                      }
                      aria-label={`Retirer ${piece.name}`}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div key={piece.id} className="composer-attachment-chip">
                    <span className="composer-attachment-chip-label">
                      Fichier: {piece.name} ({formatBytes(piece.size)})
                    </span>
                    <button
                      type="button"
                      className="composer-attachment-chip-remove"
                      onClick={() =>
                        setPendingAttachmentsByKey((previous) => ({
                          ...previous,
                          [composerKey]: (previous[composerKey] ?? []).filter(
                            (item) => item.id !== piece.id,
                          ),
                        }))
                      }
                      aria-label={`Retirer ${piece.name}`}
                    >
                      ×
                    </button>
                  </div>
                )
              ))}
            </div>
          ) : null}
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
            <div className="flex items-center gap-1.5" ref={menusRef}>
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
              <div className="relative" ref={modelsMenuRef}>
                <Badge
                  variant="secondary"
                  className="meta-chip cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setModelsMenuOpen((open) => !open);
                    setThinkingMenuOpen(false);
                  }}
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
                <div className="relative" ref={thinkingMenuRef}>
                  <Badge
                    variant="secondary"
                    className="meta-chip cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setThinkingMenuOpen((open) => !open);
                      setModelsMenuOpen(false);
                      setShowAllModels(false);
                    }}
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
              {isProcessing && selectedConversation ? (
                <Button
                  type="button"
                  className="send-button"
                  variant="secondary"
                  onClick={() => void stopPi(selectedConversation.id)}
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
              >
                {isSubmitting ? (
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
