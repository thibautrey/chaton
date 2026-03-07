import type { PiSettingsJson } from "@/features/workspace/types";
import { useTranslation } from "react-i18next";

const TOOL_VALUES = [
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
] as const;

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

export function ToolsSection({
  settings,
  setSettings,
  onSave,
}: {
  settings: PiSettingsJson;
  setSettings: (next: PiSettingsJson) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const selected = Array.isArray(settings.defaultTools)
    ? settings.defaultTools.filter(
        (tool): tool is string => typeof tool === "string",
      )
    : ["read", "bash", "edit", "write"];

  return (
    <section className="settings-card">
      <label className="settings-row-wrap">
        <span className="settings-label">defaultTools</span>
        <div className="settings-chip-row">
          {TOOL_VALUES.map((tool) => {
            const active = selected.includes(tool);
            return (
              <button
                key={tool}
                type="button"
                className={`settings-chip ${active ? "settings-chip-active" : ""}`}
                onClick={() => {
                  const next = active
                    ? selected.filter((item) => item !== tool)
                    : [...selected, tool];
                  setSettings({ ...settings, defaultTools: next });
                }}
              >
                {tool}
              </button>
            );
          })}
        </div>
      </label>
      {(
        [
          "extensionsEnabled",
          "skillsEnabled",
          "promptTemplatesEnabled",
          "themesEnabled",
          "offlineMode",
        ] as const
      ).map((key) => (
        <div className="settings-toggle-row" key={key}>
          <span className="settings-label">{key}</span>
          <Toggle
            checked={Boolean(settings[key])}
            onChange={(v) => setSettings({ ...settings, [key]: v })}
          />
        </div>
      ))}
      <button type="button" className="settings-action" onClick={onSave}>
        {t("Sauvegarder")}
      </button>
    </section>
  );
}
