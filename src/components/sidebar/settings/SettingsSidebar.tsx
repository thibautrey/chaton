import { ArrowLeft } from "lucide-react";

import { useWorkspace } from "@/features/workspace/store";
import { usePiSettingsStore } from "@/features/workspace/pi-settings-store";
import { useTranslation } from "react-i18next";

import { SettingsNav } from "./SettingsNav";

function SettingsSidebarContent() {
  const { closeSettings } = useWorkspace();
  const { activeSection, setActiveSection } = usePiSettingsStore();
  const { t } = useTranslation();

  return (
    <div className="settings-sidebar">
      <div className="settings-head">
        <button type="button" className="sidebar-item" onClick={closeSettings}>
          <ArrowLeft className="h-4 w-4" /> {t("Retour")}
        </button>
        <div className="settings-head-title">{t("Paramètres")}</div>
      </div>

      <SettingsNav active={activeSection} onChange={setActiveSection} />
    </div>
  );
}

export function SettingsSidebar() {
  return <SettingsSidebarContent />;
}
