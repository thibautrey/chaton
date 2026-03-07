import type { SidebarSettings } from "@/features/workspace/types";
import { useTranslation } from "react-i18next";

type Props = {
  settings: SidebarSettings;
  setSettings: (next: SidebarSettings) => void;
  onSave: () => void;
};

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`settings-toggle${checked ? " settings-toggle-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-thumb" />
    </button>
  );
}

export function SidebarSection({ settings, setSettings, onSave }: Props) {
  const { t } = useTranslation();

  return (
    <section className="settings-card">
      <h3 className="settings-card-title">
        {t("Affichage de la barre latérale")}
      </h3>
      <div className="settings-grid">
        <div className="settings-toggle-row">
          <span className="settings-label">
            {t("Afficher les stats assistant")}
          </span>
          <Toggle
            checked={Boolean(settings.showAssistantStats)}
            onChange={(v) =>
              setSettings({ ...settings, showAssistantStats: v })
            }
          />
        </div>
        <div className="settings-toggle-row">
          <span className="settings-label">
            {t("Autoriser les logs/crash anonymes")}
          </span>
          <Toggle
            checked={Boolean(settings.allowAnonymousTelemetry)}
            onChange={(v) =>
              setSettings({
                ...settings,
                allowAnonymousTelemetry: v,
                telemetryConsentAnswered: true,
              })
            }
          />
        </div>
      </div>
      <button type="button" className="settings-action" onClick={onSave}>
        {t("Sauvegarder")}
      </button>
    </section>
  );
}
