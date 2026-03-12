/**
 * Normalized Pi Configuration Types
 * 
 * Design principle: Configured state is authoritative.
 * Discovery is advisory. Cache is derivative.
 * 
 * This module defines the canonical type for the app's understanding of:
 * - which providers are configured
 * - which models belong to those providers
 * - which models are scoped/enabled
 * - runtime status/reachability
 * 
 * All UI surfaces should use these types, never raw Pi discovery or cache.
 */

/**
 * Auth status for a provider credential
 */
export type AuthStatus = "ok" | "missing" | "expired" | "invalid";

/**
 * Overall status of a provider based on config and discovery
 */
export type ProviderStatus = "ok" | "stale" | "unreachable" | "invalid-config";

/**
 * Overall status of a model based on config and reachability
 */
export type ModelStatus =
  | "ok"
  | "stale"
  | "unavailable"
  | "missing-auth"
  | "invalid-reference";

/**
 * Runtime reachability (separate from config validity)
 */
export type ReachabilityStatus = "ok" | "unreachable" | "timeout" | "unknown";

/**
 * A single configured model with all metadata and status
 */
export interface ConfiguredModel {
  /** Unique key for this model: "provider/id" */
  key: string;

  /** Model ID from models.json */
  id: string;

  /** Provider this model belongs to */
  provider: string;

  /** Whether this model is scoped/enabled by user */
  scoped: boolean;

  /** Whether model can be selected (configured and valid) */
  selectable: boolean;

  /** Model supports reasoning/thinking */
  supportsThinking: boolean;

  /** Model supports image input */
  imageInput: boolean;

  /** Context window size in tokens, if known */
  contextWindow?: number;

  /** Max output tokens, if known */
  maxTokens?: number;

  /** Current status of this model */
  status: ModelStatus;

  /** Reason model might not be selectable */
  reason?: string;
}

/**
 * A configured provider with all models and metadata
 */
export interface ConfiguredProvider {
  /** Provider ID from models.json */
  id: string;

  /** Provider display name */
  name: string;

  /** API type (openai-completions, etc) */
  api: string;

  /** Base URL for this provider */
  baseUrl: string;

  /** Authentication configuration */
  auth: {
    type: "oauth" | "api_key" | "none";
    status: AuthStatus;
    expiresAt?: number;
  };

  /** All configured models for this provider */
  models: ConfiguredModel[];

  /** Overall provider status based on config and discovery */
  status: ProviderStatus;

  /** Last time models were discovered/refreshed */
  lastRefreshAt?: string;

  /** If discovery failed, why */
  refreshError?: string;
}

/**
 * A scoped model that is invalid and should be removed
 */
export interface InvalidScopedEntry {
  key: string;
  reason: "provider-not-found" | "model-not-found" | "config-mismatch";
  foundProvider?: boolean;
  foundModel?: boolean;
}

/**
 * Anomalies detected during normalization
 */
export interface ConfigAnomaly {
  type:
    | "extra-provider-from-discovery"
    | "invalid-scoped-model"
    | "invalid-default-model"
    | "stale-cache-entry"
    | "auth-missing"
    | "discovery-failed";

  provider?: string;
  model?: string;
  detail: string;
}

/**
 * The normalized, canonical view of Pi configuration
 * 
 * This is the single source of truth for UI display and provider/model logic.
 * All consumers should use this type, never raw listPiModels() or cache.
 */
export interface NormalizedPiConfigState {
  /** All configured providers, keyed by provider ID */
  configuredProviders: Map<string, ConfiguredProvider>;

  /** Default provider ID, or null if invalid/missing */
  defaultProvider: string | null;

  /** Default model ID within default provider, or null if invalid/missing */
  defaultModel: string | null;

  /** Scoped model keys that were removed for being invalid */
  invalidScopedEntries: InvalidScopedEntry[];

  /** Anomalies detected during normalization */
  anomalies: ConfigAnomaly[];

  /** Timestamp when this state was built */
  builtAt: string;

  /** Whether config is complete and valid enough to use */
  isValid: boolean;
}

/**
 * Helper type for serializing NormalizedPiConfigState to JSON
 * (since Map is not JSON-serializable)
 */
export interface NormalizedPiConfigStateJSON {
  configuredProviders: Record<string, ConfiguredProvider>;
  defaultProvider: string | null;
  defaultModel: string | null;
  invalidScopedEntries: InvalidScopedEntry[];
  anomalies: ConfigAnomaly[];
  builtAt: string;
  isValid: boolean;
}

/**
 * Convert normalized state to JSON
 */
export function normalizedStateToJSON(
  state: NormalizedPiConfigState
): NormalizedPiConfigStateJSON {
  const obj: Record<string, ConfiguredProvider> = {};
  for (const [key, provider] of state.configuredProviders) {
    obj[key] = provider;
  }
  return {
    configuredProviders: obj,
    defaultProvider: state.defaultProvider,
    defaultModel: state.defaultModel,
    invalidScopedEntries: state.invalidScopedEntries,
    anomalies: state.anomalies,
    builtAt: state.builtAt,
    isValid: state.isValid,
  };
}

/**
 * Convert JSON back to normalized state
 */
export function normalizedStateFromJSON(
  json: NormalizedPiConfigStateJSON
): NormalizedPiConfigState {
  const providers = new Map<string, ConfiguredProvider>();
  for (const [key, provider] of Object.entries(json.configuredProviders)) {
    providers.set(key, provider);
  }
  return {
    configuredProviders: providers,
    defaultProvider: json.defaultProvider,
    defaultModel: json.defaultModel,
    invalidScopedEntries: json.invalidScopedEntries,
    anomalies: json.anomalies,
    builtAt: json.builtAt,
    isValid: json.isValid,
  };
}
