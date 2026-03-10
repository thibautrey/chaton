import { ChevronRight, Plus, Zap } from "lucide-react";
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

export function AutomationsSummary() {
  const { t } = useTranslation();
  const { openAutomations } = useWorkspace();
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
          { limit: 5 },
        );

        if (cancelled) return;

        if (result.ok && result.data) {
          const data = result.data as { rules?: AutomationRule[] };
          setRules(data.rules ?? []);
        }
      } catch {
        // Automation extension may not be installed
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="ad-card">
      <div className="ad-card-header">
        <Zap className="ad-card-icon h-4 w-4" />
        <h2 className="ad-card-title">
          {t("assistant.dashboard.automations")}
        </h2>
      </div>

      {loading ? (
        <div className="ad-card-loading">
          {t("assistant.dashboard.loading")}
        </div>
      ) : rules.length === 0 ? (
        <div className="ad-card-empty">
          <p>{t("assistant.dashboard.noAutomations")}</p>
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
        <>
          <div className="ad-automation-list">
            {rules.map((rule) => (
              <div key={rule.id} className="ad-automation-row">
                <Zap className="ad-automation-icon h-3.5 w-3.5" />
                <span className="ad-automation-name">{rule.name}</span>
                {rule.trigger && (
                  <span className="ad-automation-trigger">{rule.trigger}</span>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="ad-card-link"
            onClick={openAutomations}
          >
            {t("assistant.dashboard.manageAutomations")}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </section>
  );
}
