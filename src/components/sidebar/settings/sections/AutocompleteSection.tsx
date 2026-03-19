import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AutocompleteModelPicker } from "@/components/model/AutocompleteModelPicker";
import { workspaceIpc } from "@/services/ipc/workspace";

export function AutocompleteSection() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const result = await workspaceIpc.getAutocompleteModelPreference();
        if (result.ok) {
          setEnabled(result.enabled);
          setSelectedModelKey(result.modelKey);
        }
      } catch {
        // Ignore
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const handleEnabledChange = (newEnabled: boolean) => {
    setEnabled(newEnabled);
    void workspaceIpc.setAutocompleteModelPreference(newEnabled, selectedModelKey);
  };

  const handleModelChange = (modelKey: string | null) => {
    setSelectedModelKey(modelKey);
    void workspaceIpc.setAutocompleteModelPreference(enabled, modelKey);
  };

  return (
    <section className="settings-card">
      <h3 className="settings-card-title">{t("settings.autocomplete.title")}</h3>
      <div className="settings-card-note">
        {t("settings.autocomplete.desc")}
      </div>

      <div className="settings-grid">
        <div className="settings-row-wrap">
          {loaded ? (
            <AutocompleteModelPicker
              enabled={enabled}
              modelKey={selectedModelKey}
              onEnabledChange={handleEnabledChange}
              onModelChange={handleModelChange}
            />
          ) : (
            <div className="text-sm text-[#9ca3af]">
              {t("settings.models.loading")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
