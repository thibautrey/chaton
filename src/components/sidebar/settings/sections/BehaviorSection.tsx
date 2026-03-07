import type { SidebarSettings } from "@/features/workspace/types";
import { useTranslation } from "react-i18next";

type Props = {
  settings: SidebarSettings;
  setSettings: (next: SidebarSettings) => void;
  onSave: () => void;
};

export function BehaviorSection({ settings, setSettings, onSave }: Props) {
  const { t } = useTranslation();
  return (
    <section className="settings-card">
      <h3 className="settings-card-title">{t("Comportement")}</h3>
      <div className="settings-card-note">
        {t(
          "Prompt appliqué automatiquement au début de chaque message utilisateur.",
        )}
      </div>
      <label className="settings-row-wrap">
        <textarea
          className="settings-input"
          rows={18}
          value={String(settings.defaultBehaviorPrompt ?? "")}
          onChange={(e) =>
            setSettings({ ...settings, defaultBehaviorPrompt: e.target.value })
          }
        />
      </label>
      <button type="button" className="settings-action" onClick={onSave}>
        {t("Sauvegarder")}
      </button>
    </section>
  );
}
