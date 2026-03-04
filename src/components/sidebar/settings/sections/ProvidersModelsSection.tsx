import { ChevronDown, ChevronUp, Plus, Star, Trash2 } from "lucide-react";
import type { PiModelsJson } from "@/features/workspace/types";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { SecretInput } from "@/components/sidebar/settings/SecretInput";
import { workspaceIpc } from "@/services/ipc/workspace";

type PiModel = { id: string; provider: string; key: string; scoped: boolean };
type ProviderConfig = {
  api?: string;
  baseUrl?: string;
  apiKey?: string;
  [key: string]: unknown;
};
type ProviderPreset = {
  label: string;
  provider: string;
  api: "openai-completions" | "openai-responses";
  baseUrl: string;
};

const KNOWN_PROVIDER_ICON: Record<string, string> = {
  openai: "https://www.google.com/s2/favicons?sz=64&domain=openai.com",
  anthropic: "https://www.google.com/s2/favicons?sz=64&domain=anthropic.com",
  google: "https://www.google.com/s2/favicons?sz=64&domain=ai.google.dev",
  gemini: "https://www.google.com/s2/favicons?sz=64&domain=ai.google.dev",
  mistral: "https://www.google.com/s2/favicons?sz=64&domain=mistral.ai",
  groq: "https://www.google.com/s2/favicons?sz=64&domain=groq.com",
  xai: "https://www.google.com/s2/favicons?sz=64&domain=x.ai",
  perplexity: "https://www.google.com/s2/favicons?sz=64&domain=perplexity.ai",
  deepseek: "https://www.google.com/s2/favicons?sz=64&domain=deepseek.com",
  together: "https://www.google.com/s2/favicons?sz=64&domain=together.ai",
  ollama: "https://www.google.com/s2/favicons?sz=64&domain=ollama.com",
  openrouter: "https://www.google.com/s2/favicons?sz=64&domain=openrouter.ai",
};

const KNOWN_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    label: "Mistral",
    provider: "mistral",
    api: "openai-completions",
    baseUrl: "https://api.mistral.ai/v1",
  },
  {
    label: "OpenAI",
    provider: "openai",
    api: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    label: "Anthropic",
    provider: "anthropic",
    api: "openai-completions",
    baseUrl: "https://api.anthropic.com/v1",
  },
  {
    label: "Google (Gemini)",
    provider: "google",
    api: "openai-completions",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    label: "Groq",
    provider: "groq",
    api: "openai-completions",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  {
    label: "xAI",
    provider: "xai",
    api: "openai-completions",
    baseUrl: "https://api.x.ai/v1",
  },
  {
    label: "Perplexity",
    provider: "perplexity",
    api: "openai-completions",
    baseUrl: "https://api.perplexity.ai",
  },
  {
    label: "Together",
    provider: "together",
    api: "openai-completions",
    baseUrl: "https://api.together.xyz/v1",
  },
  {
    label: "DeepSeek",
    provider: "deepseek",
    api: "openai-completions",
    baseUrl: "https://api.deepseek.com/v1",
  },
  {
    label: "OpenRouter",
    provider: "openrouter",
    api: "openai-completions",
    baseUrl: "https://openrouter.ai/api/v1",
  },
];

function normalizeProviderName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function emptyProviderConfig(): ProviderConfig {
  return { api: "", baseUrl: "", apiKey: "" };
}

export function ProvidersModelsSection({
  modelsJson,
  setModelsJson,
  models,
  onToggleScope,
}: {
  modelsJson: PiModelsJson;
  setModelsJson: (next: PiModelsJson) => void;
  models: PiModel[];
  onToggleScope: (provider: string, id: string, scoped: boolean) => void;
}) {
  const { t } = useTranslation();

  const [collapsedProviders, setCollapsedProviders] = useState<
    Record<string, boolean>
  >({});
  const [isAddProviderDialogOpen, setIsAddProviderDialogOpen] = useState(false);
  const [draftProvider, setDraftProvider] = useState("");
  const [draftApi, setDraftApi] = useState<
    "openai-completions" | "openai-responses"
  >("openai-responses");
  const [draftBaseUrl, setDraftBaseUrl] = useState("");

  const providers = (modelsJson.providers ?? {}) as Record<
    string,
    ProviderConfig
  >;
  const providerNames = useMemo(
    () =>
      Array.from(
        new Set([...Object.keys(providers), ...models.map((m) => m.provider)]),
      ).sort((a, b) => a.localeCompare(b)),
    [providers, models],
  );
  const persistModelsJson = (next: PiModelsJson) => {
    setModelsJson(next);
    void workspaceIpc.updatePiModelsJson(next as Record<string, unknown>);
  };

  return (
    <section className="settings-card settings-pm-shell">
      <div className="settings-pm-topbar">
        <div className="flex w-full justify-end">
          <button
            type="button"
            className="settings-action settings-pm-btn-primary"
            onClick={() => setIsAddProviderDialogOpen(true)}
          >
            <Plus className="h-4 w-4" /> {t('Ajouter provider')}
          </button>
        </div>
      </div>

      {isAddProviderDialogOpen ? (
        <div
          className="extension-modal-backdrop"
          onClick={() => setIsAddProviderDialogOpen(false)}
        >
          <div
            className="extension-modal max-w-[720px]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="extension-modal-title">{t('Ajouter un provider')}</div>
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-2">
              {KNOWN_PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.provider}
                  type="button"
                  className="settings-action mx-auto aspect-square w-full max-w-[96px] flex-col items-center justify-center gap-1 text-center"
                  onClick={() => {
                    setDraftProvider(preset.provider);
                    setDraftApi(preset.api);
                    setDraftBaseUrl(preset.baseUrl);
                  }}
                >
                  {KNOWN_PROVIDER_ICON[
                    normalizeProviderName(preset.provider)
                  ] ? (
                    <img
                      src={
                        KNOWN_PROVIDER_ICON[
                          normalizeProviderName(preset.provider)
                        ]
                      }
                      alt=""
                      className="settings-provider-favicon mx-auto block"
                      loading="lazy"
                    />
                  ) : (
                    <div className="settings-provider-fallback mx-auto">
                      {preset.label.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="font-medium">{preset.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              <label className="settings-row-wrap">
                <span className="settings-label">provider</span>
                <input
                  className="settings-input"
                  placeholder={t('ex: openai-codex')}
                  value={draftProvider}
                  onChange={(e) => setDraftProvider(e.target.value)}
                />
              </label>
              <label className="settings-row-wrap">
                <span className="settings-label">api</span>
                <select
                  className="settings-input"
                  value={draftApi}
                  onChange={(e) =>
                    setDraftApi(
                      e.target.value as
                        | "openai-completions"
                        | "openai-responses",
                    )
                  }
                >
                  <option value="openai-responses">openai-responses</option>
                  <option value="openai-completions">openai-completions</option>
                </select>
              </label>
              <label className="settings-row-wrap">
                <span className="settings-label">baseUrl</span>
                <input
                  className="settings-input"
                  value={draftBaseUrl}
                  onChange={(e) => setDraftBaseUrl(e.target.value)}
                />
              </label>
            </div>
            <div className="extension-modal-actions">
              <button
                type="button"
                className="extension-modal-btn"
                onClick={() => setIsAddProviderDialogOpen(false)}
              >
                {t('Annuler')}
              </button>
              <button
                type="button"
                className="extension-modal-btn extension-modal-btn-primary"
                onClick={() => {
                  const key = normalizeProviderName(draftProvider);
                  if (!key || providers[key]) return;
                  persistModelsJson({
                    ...modelsJson,
                    providers: {
                      ...providers,
                      [key]: {
                        ...emptyProviderConfig(),
                        api: draftApi,
                        baseUrl: draftBaseUrl.trim(),
                      },
                    },
                  });
                  setIsAddProviderDialogOpen(false);
                  setDraftProvider("");
                  setDraftApi("openai-responses");
                  setDraftBaseUrl("");
                }}
              >
                {t('Ajouter provider')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="settings-pm-grid">
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
            <div key={name} className="settings-pm-card">
              <div className="settings-provider-head settings-pm-card-head">
                <div className="settings-provider-brand">
                  {iconSrc ? (
                    <img
                      src={iconSrc}
                      alt=""
                      className="settings-provider-favicon"
                      loading="lazy"
                    />
                  ) : (
                    <div className="settings-provider-fallback">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="settings-pm-provider-name">{name}</div>
                    <div className="settings-muted">
                      {t('{{scopedCount}} sur {{total}} dans le scope', { scopedCount, total: providerModels.length })}
                    </div>
                  </div>
                </div>
                <div className="settings-actions-grid !grid-cols-[auto_auto] !gap-1">
                  <button
                    type="button"
                    className="settings-icon-action"
                    onClick={() =>
                      setCollapsedProviders((prev) => ({
                        ...prev,
                        [name]: !isCollapsed,
                      }))
                    }
                    title={
                      isCollapsed ? t("Déplier provider") : t("Replier provider")
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
                    className="settings-icon-action"
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
                  <div className="settings-pm-form">
                    <label className="settings-row-wrap">
                      <span className="settings-label">api</span>
                      <input
                        className="settings-input"
                        value={String(provider.api ?? "")}
                        onChange={(e) =>
                          persistModelsJson({
                            ...modelsJson,
                            providers: {
                              ...providers,
                              [name]: { ...provider, api: e.target.value },
                            },
                          })
                        }
                      />
                    </label>
                    <label className="settings-row-wrap">
                      <span className="settings-label">baseUrl</span>
                      <input
                        className="settings-input"
                        value={String(provider.baseUrl ?? "")}
                        onChange={(e) =>
                          persistModelsJson({
                            ...modelsJson,
                            providers: {
                              ...providers,
                              [name]: { ...provider, baseUrl: e.target.value },
                            },
                          })
                        }
                      />
                    </label>
                    <SecretInput
                      label="apiKey"
                      onApply={(value) =>
                        persistModelsJson({
                          ...modelsJson,
                          providers: {
                            ...providers,
                            [name]: { ...provider, apiKey: value },
                          },
                        })
                      }
                    />
                  </div>

                  <div className="settings-list settings-pm-models">
                    {providerModels.map((model) => (
                      <div
                        key={model.key}
                        className="settings-list-row settings-pm-model-row"
                      >
                        <span className="settings-mono">{model.id}</span>
                        <button
                          type="button"
                          className={`settings-icon-action ${model.scoped ? "settings-pm-star-active" : ""}`}
                          onClick={() =>
                            onToggleScope(
                              model.provider,
                              model.id,
                              model.scoped,
                            )
                          }
                        >
                          <Star
                            className={`h-4 w-4 ${model.scoped ? "fill-current" : ""}`}
                          />
                        </button>
                      </div>
                    ))}
                    {!providerModels.length ? (
                      <div className="settings-muted">
                        {t('Aucun modèle détecté via `pi --list-models`.')}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>


    </section>
  );
}
