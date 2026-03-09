import { useMemo } from "react";

import type { JsonValue } from "@/features/workspace/rpc";

function formatCompactTokens(value: number): string {
  if (value >= 1_000_000) {
    const compact = value / 1_000_000;
    return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const compact = value / 1_000;
    return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}k`;
  }
  return `${value}`;
}

function extractUsageTotal(message: JsonValue): number {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return 0;
  }

  const record = message as Record<string, JsonValue>;
  if (record.role !== "assistant") {
    return 0;
  }

  const usage =
    record.usage && typeof record.usage === "object" && !Array.isArray(record.usage)
      ? (record.usage as Record<string, JsonValue>)
      : null;

  return typeof usage?.totalTokens === "number" && Number.isFinite(usage.totalTokens)
    ? Math.max(0, usage.totalTokens)
    : 0;
}

type ComposerContextUsageProps = {
  messages: JsonValue[];
  contextWindow?: number;
};

export function ComposerContextUsage({
  messages,
  contextWindow,
}: ComposerContextUsageProps) {
  const { percentage, dashOffset, tooltipLabel } = useMemo(() => {
    const capacity =
      typeof contextWindow === "number" && Number.isFinite(contextWindow)
        ? Math.max(0, contextWindow)
        : 0;
    const totalUsed = messages.reduce<number>(
      (sum, message) => sum + extractUsageTotal(message),
      0,
    );
    const safeUsed = Math.max(0, totalUsed);
    const boundedUsed = capacity > 0 ? Math.min(safeUsed, capacity) : 0;
    const ratio = capacity > 0 ? boundedUsed / capacity : 0;
    const progress = Math.max(0, Math.min(1, ratio));
    const percent = Math.round(progress * 100);
    const radius = 10;
    const circumference = 2 * Math.PI * radius;

    return {
      percentage: percent,
      dashOffset: circumference * (1 - progress),
      tooltipLabel:
        capacity > 0
          ? `Contexte: ${formatCompactTokens(boundedUsed)}/${formatCompactTokens(capacity)} (${percent}%)`
          : "Contexte du modele indisponible",
    };
  }, [contextWindow, messages]);

  const isUnavailable = !contextWindow || contextWindow <= 0;
  const strokeClassName = isUnavailable
    ? "composer-context-usage-progress is-unavailable"
    : percentage >= 90
      ? "composer-context-usage-progress is-danger"
      : percentage >= 75
        ? "composer-context-usage-progress is-warning"
        : "composer-context-usage-progress";

  return (
    <div className="composer-context-usage-wrap">
      <button
        type="button"
        className="composer-context-usage"
        aria-label={tooltipLabel}
        title={tooltipLabel}
        disabled
      >
        <svg
          className="composer-context-usage-svg"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="composer-context-usage-track"
            cx="12"
            cy="12"
            r="10"
            pathLength="100"
          />
          <circle
            className={strokeClassName}
            cx="12"
            cy="12"
            r="10"
            pathLength="100"
            strokeDasharray="62.83185307179586"
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="sr-only">{tooltipLabel}</span>
      </button>
      <div className="composer-context-usage-tooltip" role="tooltip">
        {tooltipLabel}
      </div>
    </div>
  );
}
