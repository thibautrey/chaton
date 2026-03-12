/**
 * Normalized Pi Configuration Service
 * 
 * This is the canonical entry point for understanding Chatons' Pi configuration.
 * All UI surfaces and logic should use getNormalizedPiConfig() instead of raw
 * listPiModels(), cache queries, or settings snapshots.
 * 
 * Invariants guaranteed:
 * 1. Every displayed model belongs to a configured provider
 * 2. Every scoped model exists in configured models
 * 3. Default model exists in default provider
 * 4. Cache never contains UI-visible entries for non-configured providers
 * 5. Discovery cannot create visible providers by itself
 * 6. UI does not depend on historical cache when config is authoritative
 */

import type {
  NormalizedPiConfigState,
  ConfiguredProvider,
  ConfiguredModel,
  AuthStatus,
  ConfigAnomaly,
} from "@/types/pi-config-types";

/**
 * Raw types from workspace.ts (minimal here for type safety)
 */
interface RawPiModel {
  id: string;
  provider: string;
  key: string;
  scoped: boolean;
  supportsThinking?: boolean;
  thinkingLevels?: string[];
  contextWindow?: number;
}

interface RawModelsJson {
  providers: Record<
    string,
    {
      api?: string;
      baseUrl?: string;
      apiKey?: string;
      models?: Array<{
        id: string;
        maxTokens?: number;
        reasoning?: boolean;
        imageInput?: boolean;
      }>;
    }
  >;
}

interface RawSettingsJson {
  defaultProvider?: string;
  defaultModel?: string;
  enabledModels?: string[];
}

interface RawAuthJson {
  [providerId: string]: {
    type: "oauth" | "api_key";
    access?: string;
    key?: string;
    expires?: number;
  };
}

/**
 * Builds the normalized canonical configuration from raw Pi config files
 * and the current list of models discovered from Pi.
 *
 * This is the heavy lifting function that ensures all invariants.
 *
 * @param rawModelsJson - content of models.json
 * @param rawSettingsJson - content of settings.json
 * @param rawAuthJson - content of auth.json
 * @param discoveredModels - models returned from Pi discovery (listPiModels)
 * @returns normalized state, always valid (isValid may be false if config is incomplete)
 */
export function buildNormalizedPiConfig(
  rawModelsJson: RawModelsJson | null,
  rawSettingsJson: RawSettingsJson | null,
  rawAuthJson: RawAuthJson | null,
  discoveredModels: RawPiModel[]
): NormalizedPiConfigState {
  const anomalies: ConfigAnomaly[] = [];
  const configuredProviders = new Map<string, ConfiguredProvider>();

  // Step 1: Validate and parse base structures
  if (!rawModelsJson || !rawModelsJson.providers) {
    return {
      configuredProviders,
      defaultProvider: null,
      defaultModel: null,
      invalidScopedEntries: [],
      anomalies: [{ type: "stale-cache-entry", detail: "models.json is empty or missing" }],
      builtAt: new Date().toISOString(),
      isValid: false,
    };
  }

  const providersFromConfig = Object.keys(rawModelsJson.providers);
  if (providersFromConfig.length === 0) {
    return {
      configuredProviders,
      defaultProvider: null,
      defaultModel: null,
      invalidScopedEntries: [],
      anomalies: [{ type: "stale-cache-entry", detail: "No providers configured in models.json" }],
      builtAt: new Date().toISOString(),
      isValid: false,
    };
  }

  const settings = rawSettingsJson || {};
  const auth = rawAuthJson || {};

  // Step 2: Build a map of discovered models, keyed by provider
  const discoveredByProvider = new Map<string, RawPiModel[]>();
  for (const model of discoveredModels) {
    if (!discoveredByProvider.has(model.provider)) {
      discoveredByProvider.set(model.provider, []);
    }
    discoveredByProvider.get(model.provider)!.push(model);
  }

  // Step 3: Check for extra providers from discovery
  const extraProvidersFromDiscovery = new Set(discoveredByProvider.keys());
  for (const configured of providersFromConfig) {
    extraProvidersFromDiscovery.delete(configured.toLowerCase());
  }
  if (extraProvidersFromDiscovery.size > 0) {
    anomalies.push({
      type: "extra-provider-from-discovery",
      detail: `Pi discovery returned ${Array.from(extraProvidersFromDiscovery).join(", ")} which are not configured in models.json`,
    });
  }

  // Step 4: Build normalized providers (only configured ones)
  for (const providerId of providersFromConfig) {
    const providerConfig = rawModelsJson.providers[providerId];
    if (!providerConfig) continue;

    // Determine auth status
    let authStatus: AuthStatus = "ok";
    let expiresAt: number | undefined;
    const authEntry = auth[providerId];
    if (!authEntry) {
      authStatus = "missing";
    } else if (authEntry.type === "oauth" && authEntry.expires) {
      expiresAt = authEntry.expires;
      if (expiresAt < Date.now()) {
        authStatus = "expired";
      }
    } else if (authEntry.type === "api_key" && !authEntry.key) {
      authStatus = "invalid";
    }

    // Build models for this provider
    const configuredModelsList = (providerConfig.models || []).map((modelConfig) => {
      const modelId = modelConfig.id;
      const key = `${providerId}/${modelId}`;

      // Check if this model is in scoped list
      const enabledModels = Array.isArray(settings.enabledModels)
        ? settings.enabledModels
        : [];
      const scoped = enabledModels.includes(key);

      // Find discovered data for this model (optional, for enrichment)
      const discovered = discoveredModels.find((m) => m.provider === providerId && m.id === modelId);

      const model: ConfiguredModel = {
        key,
        id: modelId,
        provider: providerId,
        scoped,
        selectable: true,
        supportsThinking: discovered?.supportsThinking ?? modelConfig.reasoning ?? false,
        imageInput: modelConfig.imageInput ?? false,
        contextWindow: discovered?.contextWindow,
        maxTokens: modelConfig.maxTokens,
        status: "ok",
      };

      return model;
    });

    const provider: ConfiguredProvider = {
      id: providerId,
      name: providerId,
      api: providerConfig.api || "openai-completions",
      baseUrl: providerConfig.baseUrl || "",
      auth: {
        type: authEntry?.type === "oauth" ? "oauth" : "api_key",
        status: authStatus,
        expiresAt,
      },
      models: configuredModelsList,
      status: authStatus === "ok" ? "ok" : "invalid-config",
    };

    configuredProviders.set(providerId, provider);
  }

  // Step 5: Validate and repair scoped models
  const settings_enabledModels = Array.isArray(settings.enabledModels)
    ? settings.enabledModels
    : [];
  const invalidScopedEntries: typeof settings.enabledModels = [];
  const validScopedEntries: typeof settings.enabledModels = [];

  for (const scopedKey of settings_enabledModels) {
    const [provider, ...modelParts] = scopedKey.split("/");
    const modelId = modelParts.join("/");

    const providerEntry = configuredProviders.get(provider);
    if (!providerEntry) {
      invalidScopedEntries.push(scopedKey);
      anomalies.push({
        type: "invalid-scoped-model",
        provider,
        model: modelId,
        detail: `Scoped model ${scopedKey} references non-configured provider ${provider}`,
      });
      continue;
    }

    const modelEntry = providerEntry.models.find((m) => m.id === modelId);
    if (!modelEntry) {
      invalidScopedEntries.push(scopedKey);
      anomalies.push({
        type: "invalid-scoped-model",
        provider,
        model: modelId,
        detail: `Scoped model ${scopedKey} not found in provider ${provider}`,
      });
      continue;
    }

    validScopedEntries.push(scopedKey);
  }

  // Update all models' scoped status based on validated list
  for (const provider of configuredProviders.values()) {
    for (const model of provider.models) {
      model.scoped = validScopedEntries.includes(model.key);
    }
  }

  // Step 6: Validate default provider and model
  let defaultProvider = typeof settings.defaultProvider === "string" ? settings.defaultProvider : null;
  let defaultModel = typeof settings.defaultModel === "string" ? settings.defaultModel : null;

  if (defaultProvider && !configuredProviders.has(defaultProvider)) {
    anomalies.push({
      type: "invalid-default-model",
      provider: defaultProvider,
      detail: `Default provider ${defaultProvider} is not configured`,
    });
    defaultProvider = null;
    defaultModel = null;
  }

  if (defaultProvider && defaultModel) {
    const providerEntry = configuredProviders.get(defaultProvider);
    const modelExists = providerEntry?.models.some((m) => m.id === defaultModel);
    if (!modelExists) {
      anomalies.push({
        type: "invalid-default-model",
        provider: defaultProvider,
        model: defaultModel,
        detail: `Default model ${defaultModel} not found in default provider ${defaultProvider}`,
      });
      defaultModel = null;
    }
  }

  // If no valid default, pick first scoped or first configured
  if (!defaultProvider && configuredProviders.size > 0) {
    const firstProvider = Array.from(configuredProviders.values())[0];
    defaultProvider = firstProvider.id;

    // Pick first scoped model, or first model overall
    const firstScoped = firstProvider.models.find((m) => m.scoped);
    if (firstScoped) {
      defaultModel = firstScoped.id;
    } else if (firstProvider.models.length > 0) {
      defaultModel = firstProvider.models[0].id;
    }
  }

  const isValid =
    configuredProviders.size > 0 &&
    defaultProvider !== null &&
    defaultModel !== null &&
    invalidScopedEntries.length === 0;

  return {
    configuredProviders,
    defaultProvider,
    defaultModel,
    invalidScopedEntries: invalidScopedEntries.map((key) => ({
      key,
      reason: "provider-not-found",
      foundProvider: false,
      foundModel: false,
    })),
    anomalies,
    builtAt: new Date().toISOString(),
    isValid,
  };
}

/**
 * Helper: Get all configured models from normalized state
 */
export function getAllConfiguredModels(
  state: NormalizedPiConfigState
): ConfiguredModel[] {
  const result: ConfiguredModel[] = [];
  for (const provider of state.configuredProviders.values()) {
    result.push(...provider.models);
  }
  return result;
}

/**
 * Helper: Get all scoped models
 */
export function getScopedModels(state: NormalizedPiConfigState): ConfiguredModel[] {
  return getAllConfiguredModels(state).filter((m) => m.scoped);
}

/**
 * Helper: Get selectable models (all configured models that are valid)
 */
export function getSelectableModels(state: NormalizedPiConfigState): ConfiguredModel[] {
  return getAllConfiguredModels(state).filter((m) => m.selectable);
}

/**
 * Helper: Get default model object, if it exists
 */
export function getDefaultModel(
  state: NormalizedPiConfigState
): ConfiguredModel | null {
  if (!state.defaultProvider || !state.defaultModel) {
    return null;
  }
  const provider = state.configuredProviders.get(state.defaultProvider);
  if (!provider) {
    return null;
  }
  return provider.models.find((m) => m.id === state.defaultModel) || null;
}

/**
 * Helper: Check if a model key is valid and configured
 */
export function isValidConfiguredModel(
  state: NormalizedPiConfigState,
  modelKey: string
): boolean {
  return getSelectableModels(state).some((m) => m.key === modelKey);
}
