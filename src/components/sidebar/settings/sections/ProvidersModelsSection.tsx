import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { PiModelsJson } from "@/features/workspace/types";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ProviderSetupForm } from "@/components/model/ProviderSetupForm";
import { ScopedModelsSelector } from "@/components/model/ScopedModelsSelector";
import { SecretInput } from "@/components/sidebar/settings/SecretInput";
import {
  KNOWN_PROVIDER_ICON,
  normalizeProviderName,
} from "@/features/workspace/provider-presets";
import { workspaceIpc } from "@/services/ipc/workspace";

type PiModel = { id: string; provider: string; key: string; scoped: boolean };
type ProviderConfig = {
  api?: string;
  baseUrl?: string;
  apiKey?: string;
  [key: string]: unknown;
};

type ProviderApiType =
  | "anthropic-messages"
  | "openai-completions"
  | "openai-responses"
  | "openai-codex-responses";

function emptyProviderConfig(): ProviderConfig {
  return { api: "", baseUrl: "", apiKey: "" };
}

export function ProvidersModelsSection({
  modelsJson,
  setModelsJson,
  models,
  onToggleScope,
  onProviderConnected,
}: {
  modelsJson: PiModelsJson;
  setModelsJson: (next: PiModelsJson) => void;
  models: PiModel[];
  onToggleScope: (model: PiModel) => void;
  onProviderConnected?: () => void;
}) {
  const { t } = useTranslation();

  const [collapsedProviders, setCollapsedProviders] = useState<
    Record<string, boolean>
  >({});
  const [isAddProviderDialogOpen, setIsAddProviderDialogOpen] = useState(false);
  const [draftProviderPreset, setDraftProviderPreset] = useState("");
  const [draftProviderName, setDraftProviderName] = useState("");
  const [draftApi, setDraftApi] =
    useState<ProviderApiType>("openai-completions");
  const [draftBaseUrl, setDraftBaseUrl] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<{
    installed: boolean;
    apiRunning: boolean;
    checked: boolean;
  }>({ installed: false, apiRunning: false, checked: false });
  const [lmStudioStatus, setLmStudioStatus] = useState<{
    installed: boolean;
    apiRunning: boolean;
    checked: boolean;
  }>({ installed: false, apiRunning: false, checked: false });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const providers = (modelsJson.providers ?? {}) as Record<
    string,
    ProviderConfig
  >;
  const selectedProviderKey = normalizeProviderName(draftProviderName);
  const isApiKeyOptionalProvider =
    selectedProviderKey === "ollama" ||
    selectedProviderKey === "lmstudio" ||
    selectedProviderKey === "custom";
  const canAddProvider =
    selectedProviderKey.length > 0 &&
    draftBaseUrl.trim().length > 0 &&
    (isApiKeyOptionalProvider || draftApiKey.trim().length > 0);
  const providerNames = useMemo(
    () => Object.keys(providers).sort((a, b) => a.localeCompare(b)),
    [providers],
  );
  const persistModelsJson = async (next: PiModelsJson) => {
    setModelsJson(next);
    await workspaceIpc.updatePiModelsJson(next as Record<string, unknown>);
  };
  const updateProviderDraft = (
    providerName: string,
    recipe: (provider: ProviderConfig) => ProviderConfig,
  ) => {
    const current = (providers[providerName] ?? emptyProviderConfig()) as ProviderConfig;
    setModelsJson({
      ...modelsJson,
      providers: {
        ...providers,
        [providerName]: recipe(current),
      },
    });
  };
  const saveProviderConfig = async (providerName: string) => {
    const current = (providers[providerName] ?? emptyProviderConfig()) as ProviderConfig;
    let nextProvider: ProviderConfig = { ...current };
    const currentBaseUrl =
      typeof nextProvider.baseUrl === "string" ? nextProvider.baseUrl.trim() : "";
    if (currentBaseUrl) {
      const resolved = await workspaceIpc.resolveProviderBaseUrl(currentBaseUrl);
      if (resolved.ok && resolved.baseUrl) {
        nextProvider = {
          ...nextProvider,
          baseUrl: resolved.baseUrl,
        };
      }
    }
    await persistModelsJson({
      ...modelsJson,
      providers: {
        ...providers,
        [providerName]: nextProvider,
      },
    });
  };
  const saveProviderConfigWithPatch = async (
    providerName: string,
    patch: Partial<ProviderConfig>,
  ) => {
    const current = (providers[providerName] ?? emptyProviderConfig()) as ProviderConfig;
    let nextProvider: ProviderConfig = {
      ...current,
      ...patch,
    };
    const currentBaseUrl =
      typeof nextProvider.baseUrl === "string" ? nextProvider.baseUrl.trim() : "";
    if (currentBaseUrl) {
      const resolved = await workspaceIpc.resolveProviderBaseUrl(currentBaseUrl);
      if (resolved.ok && resolved.baseUrl) {
        nextProvider = {
          ...nextProvider,
          baseUrl: resolved.baseUrl,
        };
      }
    }
    await persistModelsJson({
      ...modelsJson,
      providers: {
        ...providers,
        [providerName]: nextProvider,
      },
    });
  };

  const handleAddProvider = async () => {
    const key = normalizeProviderName(draftProviderName);
    if (!canAddProvider || providers[key]) return;

    setIsAddingProvider(true);
    try {
      // Resolve and normalize the base URL before saving
      // This ensures /v1 is added if needed for proper API compatibility
      let resolvedBaseUrl = draftBaseUrl.trim();
      if (resolvedBaseUrl) {
        const resolved = await workspaceIpc.resolveProviderBaseUrl(resolvedBaseUrl);
        if (resolved.ok && resolved.baseUrl) {
          resolvedBaseUrl = resolved.baseUrl;
        }
      }

      // Build provider config
      const providerConfig: Record<string, unknown> = {
        ...emptyProviderConfig(),
        api: draftApi,
        baseUrl: resolvedBaseUrl,
        apiKey: draftApiKey.trim(),
      };

      // Discover models for this provider
      const discoveryResult = await workspaceIpc.discoverProviderModels(
        providerConfig,
        key,
      );

      // Add discovered models to the provider config
      if (discoveryResult.ok && discoveryResult.models.length > 0) {
        providerConfig.models = discoveryResult.models.map((model) => {
          // provider field is omitted - Pi SDK assigns it from the provider key in models.json
          const entry: Record<string, unknown> = { id: model.id };
          if (typeof model.contextWindow === "number" && model.contextWindowSource === "provider") {
            entry.contextWindow = model.contextWindow;
          }
          if (typeof model.maxTokens === "number") {
            entry.maxTokens = model.maxTokens;
          }
          if (model.reasoning) {
            entry.reasoning = true;
          }
          if (model.imageInput) {
            entry.imageInput = true;
          }
          return entry;
        });
      } else {
        // discoveryResult.ok is false — no models were discovered
      }

      await persistModelsJson({
        ...modelsJson,
        providers: {
          ...providers,
          [key]: providerConfig,
        },
      });
      setIsAddProviderDialogOpen(false);
      setDraftProviderPreset("");
      setDraftProviderName("");
      setDraftApi("openai-completions");
      setDraftBaseUrl("");
      setDraftApiKey("");
      
      // Refresh the models list to pick up newly discovered models
      onProviderConnected?.();
    } finally {
      setIsAddingProvider(false);
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex w-full justify-end">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            onClick={() => setIsAddProviderDialogOpen((open) => !open)}
          >
            {t("Ajouter provider")}
          </button>
        </div>
      </div>

      {isAddProviderDialogOpen ? (
        <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("Ajouter un provider")}</div>
          <ProviderSetupForm
            draft={{
              providerPreset: draftProviderPreset,
              providerName: draftProviderName,
              apiType: draftApi,
              baseUrl: draftBaseUrl,
              apiKey: draftApiKey,
            }}
            onDraftChange={(next) => {
              setDraftProviderPreset(next.providerPreset);
              setDraftProviderName(next.providerName);
              setDraftApi(next.apiType);
              setDraftBaseUrl(next.baseUrl);
              setDraftApiKey(next.apiKey);
            }}
            ollamaStatus={ollamaStatus}
            lmStudioStatus={lmStudioStatus}
            onOAuthConnected={onProviderConnected}
            onSelectPreset={(providerKey) => {
              if (providerKey === "ollama") {
                void workspaceIpc.detectOllama().then((status) => {
                  setOllamaStatus({
                    installed: status.installed,
                    apiRunning: status.apiRunning,
                    checked: true,
                  });
                  if (status.installed) {
                    setDraftBaseUrl(status.baseUrl);
                  }
                });
              }
              if (providerKey === "lmstudio") {
                void workspaceIpc.detectLmStudio().then((status) => {
                  setLmStudioStatus({
                    installed: status.installed,
                    apiRunning: status.apiRunning,
                    checked: true,
                  });
                  if (status.installed) {
                    setDraftBaseUrl(status.baseUrl);
                  }
                });
              }
            }}
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              onClick={() => setIsAddProviderDialogOpen(false)}
            >
              {t("Annuler")}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              disabled={!canAddProvider || isAddingProvider}
              onClick={handleAddProvider}
            >
              {isAddingProvider ? t("Ajout en cours...") : t("Ajouter provider")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4">
        {providerNames.map((name) => {
          const provider = (providers[name] ??
            emptyProviderConfig()) as ProviderConfig;
          const providerModels = models.filter(
            (model) => model.provider === name,
          );
          const iconSrc = KNOWN_PROVIDER_ICON[normalizeProviderName(name)];
          const scopedCount = providerModels.filter(
            (model) => model.scoped,
          ).length;
          const isCollapsed = collapsedProviders[name] ?? true;
          return (
            <div key={name} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div
                className={`flex items-center justify-between gap-3 px-4 py-3 ${!isCollapsed ? "border-b border-zinc-200 dark:border-zinc-800" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {iconSrc ? (
                    <img
                      src={iconSrc}
                      alt=""
                      className="h-8 w-8 rounded-md object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{name}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {t("{{scopedCount}} sur {{total}} dans le scope", {
                        scopedCount,
                        total: providerModels.length,
                      })}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-[auto_auto] gap-1">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    onClick={() =>
                      setCollapsedProviders((prev) => ({
                        ...prev,
                        [name]: !isCollapsed,
                      }))
                    }
                    title={
                      isCollapsed
                        ? t("Déplier provider")
                        : t("Replier provider")
                    }
                    aria-expanded={!isCollapsed}
                  >
                    {isCollapsed ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    onClick={() => {
                      const nextProviders = { ...providers };
                      delete nextProviders[name];
                      persistModelsJson({
                        ...modelsJson,
                        providers: nextProviders,
                      });
                    }}
                    title={t("Supprimer provider")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {!isCollapsed ? (
                <>
                  <div className="space-y-3 p-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">api</span>
                      <input
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
                        value={String(provider.api ?? "")}
                        onChange={(e) =>
                          updateProviderDraft(name, (current) => ({
                            ...current,
                            api: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          void saveProviderConfig(name);
                        }}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">baseUrl</span>
                      <input
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
                        value={String(provider.baseUrl ?? "")}
                        onChange={(e) =>
                          updateProviderDraft(name, (current) => ({
                            ...current,
                            baseUrl: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          void saveProviderConfig(name);
                        }}
                      />
                    </label>
                    <SecretInput
                      label="apiKey"
                      onApply={(value) =>
                        void saveProviderConfigWithPatch(name, { apiKey: value })
                      }
                    />
                  </div>

                  <ScopedModelsSelector
                    models={providerModels}
                    onToggleScope={(model) =>
                      onToggleScope({
                        id: model.id,
                        provider: model.provider,
                        key: model.key,
                        scoped: model.scoped,
                      })
                    }
                    emptyText={t(
                      "Aucun modèle détecté via `pi --list-models`.",
                    )}
                  />
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
