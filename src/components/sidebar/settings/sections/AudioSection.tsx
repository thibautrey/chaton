import type { SidebarSettings } from "@/features/workspace/types";
import { useTranslation } from "react-i18next";

type Props = {
  settings: SidebarSettings;
  setSettings: (next: SidebarSettings) => void;
  onSave: () => void;
};

export function AudioSection({ settings, setSettings, onSave }: Props) {
  const { t } = useTranslation();

  return (
    <section className="space-y-4 rounded-2xl border border-[#dcdddf] bg-[#f7f7f9] p-5 dark:border-[#262934] dark:bg-[#151821]">
      <h3 className="text-base font-semibold text-[#1e1f26] dark:text-[#f3f4f6]">{t("Audio")}</h3>
      <div className="space-y-3">
        <label className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-white/50 dark:hover:bg-white/5">
          <span className="text-xs text-[#696b74] dark:text-[#9ca3af]">{t("Chime à la fin des conversations")}</span>
          <input
            type="checkbox"
            checked={settings.enableConversationChime ?? true}
            onChange={(e) =>
              setSettings({ ...settings, enableConversationChime: e.target.checked })
            }
          />
        </label>
        <label className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-white/50 dark:hover:bg-white/5">
          <div>
            <div className="text-xs text-[#696b74] dark:text-[#9ca3af]">{t("Activer le hybrid harness")}</div>
            <div className="text-[11px] text-[#8a8d96] dark:text-[#7f8594]">
              {t("Affiche le harness actif, permet le vote utilisateur et alimente l'optimizer.")}
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.enableMetaHarnessFeedback ?? false}
            onChange={(e) =>
              setSettings({ ...settings, enableMetaHarnessFeedback: e.target.checked })
            }
          />
        </label>
      </div>
      <button
        type="button"
        className="rounded-lg border border-[#cacbd1] bg-white px-3 py-2 text-sm font-medium text-[#3b3d45] transition-colors hover:bg-[#f2f2f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9bac1] dark:border-[#343845] dark:bg-[#0f1218] dark:text-[#e5e7eb] dark:hover:bg-[#161b24]"
        onClick={onSave}
      >
        {t("Sauvegarder")}
      </button>
    </section>
  );
}
