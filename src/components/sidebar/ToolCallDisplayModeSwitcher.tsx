import { AlignJustify, List, Minus } from "lucide-react";

import type { ToolCallDisplayMode } from "@/features/workspace/types";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/workspace/store";

const MODES: Array<{
  value: ToolCallDisplayMode;
  icon: React.ReactNode;
  labelKey: string;
}> = [
  { value: "verbose", icon: <List className="h-3 w-3" />, labelKey: "Verbose" },
  {
    value: "light",
    icon: <AlignJustify className="h-3 w-3" />,
    labelKey: "Light",
  },
  { value: "quiet", icon: <Minus className="h-3 w-3" />, labelKey: "Quiet" },
];

export function ToolCallDisplayModeSwitcher() {
  const { t } = useTranslation();
  const { state, updateSettings } = useWorkspace();
  const currentMode = state.settings.toolCallDisplayMode;

  const handleModeChange = async (mode: ToolCallDisplayMode) => {
    if (mode === currentMode) return;
    await updateSettings({
      ...state.settings,
      toolCallDisplayMode: mode,
    });
  };

  return (
    <div className="tool-call-display-mode-wrap">
      <div
        className="tool-call-display-mode-tooltip"
        id="tool-call-display-mode-tooltip"
        role="tooltip"
      >
        <p className="tool-call-display-mode-tooltip-title">
          {t("Quel mode d'affichage choisir ?")}
        </p>
        <div className="tool-call-display-mode-tooltip-grid">
          {MODES.map((mode) => (
            <section
              key={mode.value}
              className="tool-call-display-mode-tooltip-card"
            >
              <div className="tool-call-display-mode-tooltip-card-icon">
                {mode.icon}
              </div>
              <div className="tool-call-display-mode-tooltip-card-content">
                <p className="tool-call-display-mode-tooltip-label">
                  {t(mode.labelKey)}
                </p>
                <p className="tool-call-display-mode-tooltip-desc">
                  {t(`toolCallDisplayMode.${mode.value}.description`)}
                </p>
              </div>
            </section>
          ))}
        </div>
      </div>
      <div
        className="tool-call-display-mode-switcher"
        role="radiogroup"
        aria-label={t("Affichage des appels d'outils")}
        aria-describedby="tool-call-display-mode-tooltip"
      >
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={currentMode === mode.value}
            className={`tool-call-mode-segment ${currentMode === mode.value ? "tool-call-mode-segment-active" : ""}`}
            onClick={() => handleModeChange(mode.value)}
            title={t(`toolCallDisplayMode.${mode.value}.description`)}
          >
            {mode.icon}
            <span>{t(mode.labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
