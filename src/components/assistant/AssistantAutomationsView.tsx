import { ArrowLeft, Plus, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";

type AutomationRule = {
  id: string;
  name: string;
  instruction: string;
  trigger?: string;
  cooldown?: number;
  enabled?: boolean;
};

export function AssistantAutomationsView() {
  const { t } = useTranslation();
  const { setAssistantView, openAutomations } = useWorkspace();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const result = await workspaceIpc.extensionHostCall(
          "@chaton/automation",
          "automation.list_scheduled_tasks",
          {},
        );
        if (cancelled) return;
        if (result.ok && result.data) {
          const data = result.data as { rules?: AutomationRule[] };
          setRules(data.rules ?? []);
        }
      } catch {
        // Extension not available
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="ad-subview">
      <div className="ad-subview-header">
        <button
          type="button"
          className="ad-back-btn"
          onClick={() => setAssistantView("home")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Zap className="ad-subview-icon h-5 w-5" />
        <h1 className="ad-subview-title">{t("assistant.automations.title")}</h1>
      </div>
      <p className="ad-subview-desc">{t("assistant.automations.desc")}</p>

      <div className="ad-subview-scroll">
        {loading ? (
          <div className="ad-card-loading">
            {t("assistant.dashboard.loading")}
          </div>
        ) : rules.length === 0 ? (
          <div className="ad-card-empty">
            <Zap className="h-8 w-8 text-[#b0b5c0] dark:text-[#5a6580]" />
            <p>{t("assistant.automations.empty")}</p>
            <p className="ad-card-hint">
              {t("assistant.automations.emptyHint")}
            </p>
            <button
              type="button"
              className="ad-card-action"
              onClick={openAutomations}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("assistant.dashboard.createAutomation")}
            </button>
          </div>
        ) : (
          <div className="ad-automation-full-list">
            {rules.map((rule) => (
              <div key={rule.id} className="ad-automation-full-row">
                <div className="ad-automation-full-icon">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="ad-automation-full-content">
                  <div className="ad-automation-full-name">{rule.name}</div>
                  <div className="ad-automation-full-instruction">
                    {rule.instruction}
                  </div>
                  {rule.trigger && (
                    <div className="ad-automation-full-trigger">
                      {t("assistant.automations.trigger")}: {rule.trigger}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="ad-card-action mt-3"
              onClick={openAutomations}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("assistant.automations.manage")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
