/**
 * Pi Configuration Diagnostics
 * 
 * Detects and reports anomalies in the Pi configuration system,
 * making debugging and support much easier.
 */

import type { NormalizedPiConfigState, ConfigAnomaly } from "@/types/pi-config-types";

/**
 * Comprehensive diagnostics report
 */
export interface PiConfigDiagnostics {
  timestamp: string;
  isHealthy: boolean;
  summary: string;
  
  configuredProviders: {
    count: number;
    list: string[];
    withAuthIssues: string[];
  };
  
  configuredModels: {
    count: number;
    byProvider: Record<string, number>;
    withIssues: number;
  };
  
  scopedModels: {
    count: number;
    valid: number;
    invalid: number;
    invalidList: string[];
  };
  
  defaultModel: {
    configured: boolean;
    provider: string | null;
    model: string | null;
    valid: boolean;
  };
  
  anomalies: ConfigAnomaly[];
  
  recommendations: string[];
}

/**
 * Build a comprehensive diagnostics report
 */
export function buildPiConfigDiagnostics(
  state: NormalizedPiConfigState
): PiConfigDiagnostics {
  const recommendations: string[] = [];
  
  // Count configured providers
  const providers = Array.from(state.configuredProviders.keys());
  const providersWithAuthIssues = Array.from(state.configuredProviders.values())
    .filter((p) => p.auth.status !== "ok")
    .map((p) => p.id);
  
  // Count configured models
  let totalModels = 0;
  const modelsByProvider: Record<string, number> = {};
  let modelsWithIssues = 0;
  
  for (const provider of state.configuredProviders.values()) {
    modelsByProvider[provider.id] = provider.models.length;
    totalModels += provider.models.length;
    modelsWithIssues += provider.models.filter((m) => m.status !== "ok").length;
  }
  
  // Count scoped models
  const allModels = Array.from(state.configuredProviders.values()).flatMap((p) =>
    p.models
  );
  const scopedModels = allModels.filter((m) => m.scoped);
  const validScoped = scopedModels.filter((m) => m.selectable);
  const invalidScoped = state.invalidScopedEntries;
  
  // Detect anomalies and recommendations
  const anomalies = [...state.anomalies];
  
  if (providers.length === 0) {
    anomalies.push({
      type: "stale-cache-entry",
      detail: "No providers configured. Add a provider in Settings to get started.",
    });
    recommendations.push("Add at least one provider in Chatons Settings");
  }
  
  if (providersWithAuthIssues.length > 0) {
    anomalies.push({
      type: "auth-missing",
      detail: `Providers with auth issues: ${providersWithAuthIssues.join(", ")}`,
    });
    recommendations.push(
      `Fix authentication for: ${providersWithAuthIssues.join(", ")}`
    );
  }
  
  if (totalModels === 0) {
    recommendations.push("No models found. Run model discovery or add provider credentials.");
  }
  
  if (invalidScoped.length > 0) {
    recommendations.push(
      `${invalidScoped.length} scoped models are invalid and should be removed.`
    );
  }
  
  if (!state.defaultProvider || !state.defaultModel) {
    recommendations.push("Default model is not set. Select one in Settings.");
  }
  
  // Detect extra providers from discovery (already in anomalies from normalization)
  const extraProviderAnomalies = anomalies.filter(
    (a) => a.type === "extra-provider-from-discovery"
  );
  if (extraProviderAnomalies.length > 0) {
    recommendations.push(
      "Extra providers were detected from discovery but not configured. " +
        "These models will not appear in the UI. Configure them in Settings if needed."
    );
  }
  
  const isHealthy =
    providers.length > 0 &&
    providersWithAuthIssues.length === 0 &&
    invalidScoped.length === 0 &&
    state.defaultProvider !== null &&
    state.defaultModel !== null &&
    anomalies.length === 0;
  
  const summary = isHealthy
    ? `✓ Configuration OK: ${providers.length} provider(s), ${totalModels} model(s), ${scopedModels.length} scoped`
    : `⚠ Configuration issues: ${anomalies.length} anomaly(ies), ${invalidScoped.length} invalid scoped`;
  
  return {
    timestamp: new Date().toISOString(),
    isHealthy,
    summary,
    
    configuredProviders: {
      count: providers.length,
      list: providers,
      withAuthIssues: providersWithAuthIssues,
    },
    
    configuredModels: {
      count: totalModels,
      byProvider: modelsByProvider,
      withIssues: modelsWithIssues,
    },
    
    scopedModels: {
      count: scopedModels.length,
      valid: validScoped.length,
      invalid: invalidScoped.length,
      invalidList: invalidScoped.map((e) => e.key),
    },
    
    defaultModel: {
      configured: state.defaultProvider !== null && state.defaultModel !== null,
      provider: state.defaultProvider,
      model: state.defaultModel,
      valid: state.isValid,
    },
    
    anomalies,
    recommendations,
  };
}

/**
 * Format diagnostics for display in UI or logs
 */
export function formatPiConfigDiagnostics(diag: PiConfigDiagnostics): string {
  const lines: string[] = [];
  
  lines.push(`=== Chatons Pi Configuration Diagnostics ===`);
  lines.push(`Timestamp: ${diag.timestamp}`);
  lines.push(`Status: ${diag.summary}`);
  lines.push("");
  
  lines.push(`Configured Providers (${diag.configuredProviders.count}):`);
  for (const p of diag.configuredProviders.list) {
    const hasAuthIssue = diag.configuredProviders.withAuthIssues.includes(p);
    const modelCount = diag.configuredModels.byProvider[p] || 0;
    lines.push(`  - ${p} ${hasAuthIssue ? "(⚠ auth issue)" : ""} [${modelCount} models]`);
  }
  lines.push("");
  
  lines.push(`Configured Models: ${diag.configuredModels.count}`);
  for (const [provider, count] of Object.entries(diag.configuredModels.byProvider)) {
    lines.push(`  ${provider}: ${count}`);
  }
  lines.push("");
  
  lines.push(
    `Scoped Models: ${diag.scopedModels.count} (${diag.scopedModels.valid} valid, ${diag.scopedModels.invalid} invalid)`
  );
  if (diag.scopedModels.invalidList.length > 0) {
    lines.push(`  Invalid entries:`);
    for (const key of diag.scopedModels.invalidList) {
      lines.push(`    - ${key}`);
    }
  }
  lines.push("");
  
  lines.push(
    `Default Model: ${diag.defaultModel.provider || "none"}/${diag.defaultModel.model || "none"}`
  );
  lines.push("");
  
  if (diag.anomalies.length > 0) {
    lines.push(`Anomalies (${diag.anomalies.length}):`);
    for (const anom of diag.anomalies) {
      lines.push(`  [${anom.type}] ${anom.detail}`);
    }
    lines.push("");
  }
  
  if (diag.recommendations.length > 0) {
    lines.push(`Recommendations:`);
    for (const rec of diag.recommendations) {
      lines.push(`  • ${rec}`);
    }
  }
  
  return lines.join("\n");
}
