import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ThreadModelControls } from "@/components/model/ThreadModelControls";
import type { PiModel } from "@/components/model/types";
import { workspaceIpc } from "@/services/ipc/workspace";

const AUTO_KEY = "__auto__";

// Synthetic model entry representing "auto" mode
const AUTO_MODEL: PiModel = {
  id: "Auto (last used model)",
  provider: "auto",
  key: AUTO_KEY,
  scoped: true,
  supportsThinking: false,
  thinkingLevels: [],
};

type AutocompleteModelPickerProps = {
  /** Whether autocomplete is enabled */
  enabled: boolean;
  /** Current persisted model key, or null for auto */
  modelKey: string | null;
  /** Called when the user changes the enabled state */
  onEnabledChange: (enabled: boolean) => void;
  /** Called when the user picks a model (null = auto) */
  onModelChange: (modelKey: string | null) => void;
};

/**
 * Reusable model picker for autocomplete settings.
 * Wraps ThreadModelControls with an "Auto" option and no thinking/access controls.
 */
export function AutocompleteModelPicker({
  enabled,
  modelKey,
  onEnabledChange,
  onModelChange,
}: AutocompleteModelPickerProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<PiModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const result = await workspaceIpc.listPiModels();
        if (result.ok) {
          setModels(result.models);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const refreshModels = async () => {
    try {
      const result = await workspaceIpc.listPiModels();
      if (result.ok) {
        setModels(result.models);
      }
    } catch {
      // Ignore
    }
  };

  // Prepend the auto entry
  const allModels: PiModel[] = [
    { ...AUTO_MODEL, id: t("settings.autocomplete.modelAuto") },
    ...models,
  ];

  const selectedKey = modelKey ?? AUTO_KEY;

  return (
    <div className="space-y-3">
      {/* Enable/Disable toggle */}
      <div className="flex items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="peer sr-only"
          />
          <div className="peer h-6 w-11 rounded-full bg-[#e5e7eb] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#6366f1] peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-[#374151] dark:after:border-[#4b5563] dark:after:bg-[#9ca3af] peer-checked:dark:after:border-white"></div>
        </label>
        <span className="text-sm text-[#374151] dark:text-[#e7e9ef]">
          {enabled
            ? t("settings.autocomplete.enabled")
            : t("settings.autocomplete.disabled")}
        </span>
      </div>

      {/* Model picker */}
      {enabled && (
        <div className="mt-2">
          {loading ? (
            <div className="text-sm text-[#9ca3af]">
              {t("settings.models.loading")}
            </div>
          ) : (
            <ThreadModelControls
              models={allModels}
              selectedModelKey={selectedKey}
              isLoadingModels={loading}
              isUpdatingScope={false}
              onApplyModel={async (key) => {
                onModelChange(key === AUTO_KEY ? null : key);
              }}
              onToggleModelScoped={async () => {}}
              onThinkingChange={async () => {}}
              onAccessModeChange={async () => {}}
              onOpenModelsMenu={() => void refreshModels()}
              t={t}
              showScopeToggle={false}
              showThinking={false}
              showAccessMode={false}
              dropdownDirection="down"
            />
          )}
        </div>
      )}

      {/* Hint */}
      {enabled && (
        <p className="text-xs text-[#9ca3af]">
          {t("settings.autocomplete.hint")}
        </p>
      )}
    </div>
  );
}
