import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TFunction } from "i18next";

import type { Conversation } from "@/features/workspace/types";
import { workspaceIpc } from "@/services/ipc/workspace";

import {
  findLastConversationModel,
  parseModelKey,
  readSavedGlobalAccessMode,
  readSavedGlobalModel,
  saveGlobalAccessMode,
  saveGlobalModel,
} from "./models";
import type { PiModel, ThinkingLevel } from "./types";

type RuntimeModelSnapshot = {
  state?: {
    model?: {
      provider: string;
      id: string;
    } | null;
  } | null;
};

type UseComposerModelStateArgs = {
  cachedModels: PiModel[];
  configuredProviders: Set<string>;
  selectedConversation: Conversation | null;
  selectedRuntime: RuntimeModelSnapshot | null;
  conversations: Conversation[];
  refreshModelsForPicker: () => Promise<void> | void;
  setPiModel: (
    conversationId: string,
    provider: string,
    modelId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  setPiThinkingLevel: (
    conversationId: string,
    level: ThinkingLevel,
  ) => Promise<{ success: boolean; error?: string }>;
  setConversationAccessMode: (
    conversationId: string,
    mode: "secure" | "open",
  ) => Promise<{ ok: boolean; reason?: string; message?: string }>;
  notify: (message: string, type?: "error" | "info" | "success" | "warning") => void;
  t: TFunction;
};

type UseComposerModelStateResult = {
  models: PiModel[];
  selectedModelKey: string;
  selectedThinking: ThinkingLevel;
  selectedAccessMode: "secure" | "open";
  updatingModelKeys: Set<string>;
  accessModeTooltip: string;
  handleToggleModelScoped: (model: {
    id: string;
    provider: string;
    scoped: boolean;
  }) => Promise<void>;
  handleApplyModel: (modelKey: string) => Promise<void>;
  handleThinkingChange: (level: ThinkingLevel) => Promise<void>;
  handleAccessModeChange: (mode: "secure" | "open") => Promise<void>;
};

export function useComposerModelState({
  cachedModels,
  configuredProviders,
  selectedConversation,
  selectedRuntime,
  conversations,
  refreshModelsForPicker,
  setPiModel,
  setPiThinkingLevel,
  setConversationAccessMode,
  notify,
  t,
}: UseComposerModelStateArgs): UseComposerModelStateResult {
  const [optimisticModels, setOptimisticModels] = useState<PiModel[] | null>(null);
  const [selectedModelKey, setSelectedModelKey] = useState<string>(
    () => readSavedGlobalModel() ?? "openai-codex/gpt-5.3-codex",
  );
  const [selectedThinking, setSelectedThinking] = useState<ThinkingLevel>("medium");
  const [selectedAccessMode, setSelectedAccessMode] = useState<"secure" | "open">(
    () => readSavedGlobalAccessMode(),
  );
  const [updatingModelKeys, setUpdatingModelKeys] = useState<Set<string>>(new Set());

  const models = optimisticModels ?? cachedModels;
  const lastGlobalModelRef = useRef<string | null>(readSavedGlobalModel());
  const lastConversationIdForModelRef = useRef<string | null>(null);

  useEffect(() => {
    if (!optimisticModels || cachedModels.length === 0) {
      return;
    }
    const optimisticScopeByKey = new Map(
      optimisticModels.map((model) => [model.key, model.scoped]),
    );
    const matches =
      optimisticModels.length === cachedModels.length &&
      cachedModels.every(
        (model) => optimisticScopeByKey.get(model.key) === model.scoped,
      );
    if (matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptimisticModels(null);
    }
  }, [cachedModels, optimisticModels]);

  useEffect(() => {
    if (models.length === 0) {
      return;
    }

    const currentConversationId = selectedConversation?.id ?? null;
    const currentSelectionIsAvailable = models.some(
      (model) => model.key === selectedModelKey,
    );
    const modelFromConversation =
      selectedConversation?.modelProvider && selectedConversation?.modelId
        ? `${selectedConversation.modelProvider}/${selectedConversation.modelId}`
        : null;
    const modelFromRuntime = selectedRuntime?.state?.model
      ? `${selectedRuntime.state.model.provider}/${selectedRuntime.state.model.id}`
      : null;

    let targetModelKey: string | null = null;
    const isNewConversation =
      currentConversationId !== lastConversationIdForModelRef.current;

    if (isNewConversation) {
      lastConversationIdForModelRef.current = currentConversationId;

      if (modelFromConversation) {
        targetModelKey = modelFromConversation;
      } else if (modelFromRuntime) {
        targetModelKey = modelFromRuntime;
      } else if (currentSelectionIsAvailable && selectedModelKey) {
        targetModelKey = selectedModelKey;
      } else {
        const savedModel =
          lastGlobalModelRef.current ??
          readSavedGlobalModel() ??
          findLastConversationModel(conversations);
        const fallbackModel =
          (savedModel
            ? models.find((model) => model.key === savedModel)
            : null) ??
          models.find((model) => model.scoped) ??
          models[0] ??
          null;
        targetModelKey = fallbackModel?.key ?? null;
      }
    } else if (modelFromConversation) {
      targetModelKey = modelFromConversation;
    } else if (modelFromRuntime) {
      targetModelKey = modelFromRuntime;
    } else if (currentSelectionIsAvailable && selectedModelKey) {
      targetModelKey = selectedModelKey;
    } else {
      const savedModel =
        lastGlobalModelRef.current ??
        readSavedGlobalModel() ??
        findLastConversationModel(conversations);
      const fallbackModel =
        (savedModel
          ? models.find((model) => model.key === savedModel)
          : null) ??
        models.find((model) => model.scoped) ??
        models[0] ??
        null;
      targetModelKey = fallbackModel?.key ?? null;
    }

    if (targetModelKey && targetModelKey !== selectedModelKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedModelKey(targetModelKey);
    }

    if (targetModelKey && targetModelKey !== lastGlobalModelRef.current) {
      lastGlobalModelRef.current = targetModelKey;
      saveGlobalModel(targetModelKey);
    }
  }, [
    conversations,
    models,
    selectedConversation?.id,
    selectedConversation?.modelId,
    selectedConversation?.modelProvider,
    selectedModelKey,
    selectedRuntime?.state?.model,
  ]);

  useEffect(() => {
    if (selectedConversation?.accessMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAccessMode(selectedConversation.accessMode);
      saveGlobalAccessMode(selectedConversation.accessMode);
      return;
    }
    setSelectedAccessMode(readSavedGlobalAccessMode());
  }, [selectedConversation?.accessMode]);

  const selectedModel = useMemo(
    () => models.find((model) => model.key === selectedModelKey),
    [models, selectedModelKey],
  );
  const availableThinkingLevels = useMemo(
    () =>
      selectedModel?.supportsThinking ? selectedModel.thinkingLevels : [],
    [selectedModel],
  );

  useEffect(() => {
    if (
      availableThinkingLevels.length > 0 &&
      !availableThinkingLevels.includes(selectedThinking)
    ) {
      const newThinking = availableThinkingLevels[0];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedThinking((previous) =>
        previous === newThinking ? previous : newThinking,
      );
    }
  }, [availableThinkingLevels, selectedThinking]);

  const handleToggleModelScoped = useCallback(
    async (model: { id: string; provider: string; scoped: boolean }) => {
      const targetKey = `${model.provider}/${model.id}`;
      if (updatingModelKeys.has(targetKey)) {
        return;
      }

      setUpdatingModelKeys((previous) => new Set(previous).add(targetKey));
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

      setUpdatingModelKeys((previous) => {
        const next = new Set(previous);
        next.delete(targetKey);
        return next;
      });

      if (!result.ok) {
        setOptimisticModels((previous) =>
          (previous ?? models).map((item) =>
            item.key === targetKey ? { ...item, scoped: model.scoped } : item,
          ),
        );
        notify("Impossible de modifier le scope du modèle dans Pi.", "error");
        return;
      }

      await refreshModelsForPicker();
      setOptimisticModels(null);

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
    },
    [configuredProviders, models, notify, refreshModelsForPicker, selectedModelKey, updatingModelKeys],
  );

  const handleApplyModel = useCallback(
    async (modelKey: string) => {
      setSelectedModelKey(modelKey);

      if (!selectedConversation) {
        return;
      }

      const parsedModel = parseModelKey(modelKey);
      if (!parsedModel) {
        notify("Format de modèle invalide.", "error");
        return;
      }

      const response = await setPiModel(
        selectedConversation.id,
        parsedModel.provider,
        parsedModel.modelId,
      );
      if (!response.success) {
        notify(response.error ?? "Impossible de changer de modèle.", "error");
      }
    },
    [notify, selectedConversation, setPiModel],
  );

  const handleThinkingChange = useCallback(
    async (level: ThinkingLevel) => {
      if (!availableThinkingLevels.includes(level)) {
        return;
      }
      setSelectedThinking(level);

      if (!selectedConversation) {
        return;
      }

      const response = await setPiThinkingLevel(selectedConversation.id, level);
      if (!response.success) {
        notify(
          response.error ?? "Impossible de changer le niveau de réflexion.",
          "error",
        );
      }
    },
    [availableThinkingLevels, notify, selectedConversation, setPiThinkingLevel],
  );

  const accessModeTooltip =
    selectedConversation?.runtimeLocation === "cloud"
      ? t(
          "Conversation cloud: le runtime s’exécute à distance. Le mode d’accès reste piloté par le contexte cloud et les capacités du projet.",
        )
      : selectedAccessMode === "secure"
        ? t(
            "Mode sécurisé: comportement actuel, accès limité au contexte de la conversation.",
          )
        : t(
            "Mode ouvert: Chaton peut accéder à des fichiers/dossiers hors contexte initial et exécuter les commandes nécessaires.",
          );

  const handleAccessModeChange = useCallback(
    async (mode: "secure" | "open") => {
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
        const errorMessage =
          result.reason === "restart_failed"
            ? `Mode changed but session restart failed: ${result.message || "Unknown error"}`
            : t(
                "composer.accessModeChangeFailed",
                "Unable to change agent access mode.",
              );
        notify(errorMessage, "error");
        setSelectedAccessMode(selectedConversation.accessMode ?? "secure");
      }
    },
    [notify, selectedConversation, setConversationAccessMode, t],
  );

  return {
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
  };
}
