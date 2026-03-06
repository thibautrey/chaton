import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { PiModelsJson } from "@/features/workspace/types";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ModelScopePicker } from "@/components/model/ModelScopePicker";
import { SecretInput } from "@/components/sidebar/settings/SecretInput";
import {
  KNOWN_PROVIDER_ICON,
  KNOWN_PROVIDER_PRESETS,
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
  const [draftProviderPreset, setDraftProviderPreset] = useState("");
  const [draftProviderName, setDraftProviderName] = useState("");
  const [draftApi, setDraftApi] = useState<
    "openai-completions" | "openai-responses"
  >("openai-completions");
  const [draftBaseUrl, setDraftBaseUrl] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
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

  const providers = (modelsJson.providers ?? {}) as Record<
    string,
    ProviderConfig
  >;
  const selectedProviderKey = normalizeProviderName(draftProviderName);
  const selectedProviderPreset = KNOWN_PROVIDER_PRESETS.find(
    (p) => normalizeProviderName(p.provider) === normalizeProviderName(draftProviderPreset),
  );
  const isApiKeyOptionalProvider =
    selectedProviderKey === "ollama" ||
    selectedProviderKey === "lmstudio" ||
    selectedProviderKey === "custom";
  const isLocalOllama =
    selectedProviderKey === "ollama" &&
    ollamaStatus.checked &&
    ollamaStatus.installed &&
    ollamaStatus.apiRunning;
  const isLocalLmStudio =
    selectedProviderKey === "lmstudio" &&
    lmStudioStatus.checked &&
    lmStudioStatus.installed &&
    lmStudioStatus.apiRunning;
  const canAddProvider =
    selectedProviderKey.length > 0 &&
    draftBaseUrl.trim().length > 0 &&
    (isApiKeyOptionalProvider || draftApiKey.trim().length > 0);
  const providerNames = useMemo(
    () => Object.keys(providers).sort((a, b) => a.localeCompare(b)),
    [providers],
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
            <div className="onboarding-provider-grid">
              {KNOWN_PROVIDER_PRESETS.map((preset) => {
                const iconSrc =
                  KNOWN_PROVIDER_ICON[normalizeProviderName(preset.provider)];
                const isSelected =
                  normalizeProviderName(draftProviderPreset) ===
                  normalizeProviderName(preset.provider);
                return (
                  <button
                    key={preset.provider}
                    type="button"
                    className={`onboarding-provider-card group ${isSelected ? "is-selected" : ""}`}
                    onClick={() => {
                      setDraftProviderPreset(preset.provider);
                      setDraftProviderName(preset.provider === "custom" ? "" : preset.provider);
                      setDraftApi(preset.api);
                      setDraftBaseUrl(preset.baseUrl);
                      if (normalizeProviderName(preset.provider) === "ollama") {
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
                      if (
                        normalizeProviderName(preset.provider) === "lmstudio"
                      ) {
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
                  >
                    {iconSrc ? (
                      <img src={iconSrc} alt="" loading="lazy" />
                    ) : (
                      <span>{preset.label.slice(0, 1)}</span>
                    )}
                    <strong>{preset.label}</strong>
                  </button>
                );
              })}
            </div>
            <div className="onboarding-section mt-3">
              {draftProviderPreset === "custom" ? (
                <>
                  <label>
                    Provider name
                    <input
                      value={draftProviderName}
                      onChange={(e) => setDraftProviderName(e.target.value)}
                    />
                  </label>
                  <label>
                    API type
                    <select
                      value={draftApi}
                      onChange={(e) =>
                        setDraftApi(
                          e.target.value as
                            | "openai-responses"
                            | "openai-completions",
                        )
                      }
                    >
                      <option value="openai-responses">openai-responses</option>
                      <option value="openai-completions">
                        openai-completions
                      </option>
                    </select>
                  </label>
                  <label>
                    Base URL
                    <input
                      value={draftBaseUrl}
                      onChange={(e) => setDraftBaseUrl(e.target.value)}
                    />
                  </label>
                </>
              ) : null}
              {selectedProviderKey === "ollama" && ollamaStatus.checked ? (
                <div className="settings-muted" style={{ marginBottom: "8px" }}>
                  {ollamaStatus.installed
                    ? ollamaStatus.apiRunning
                      ? "Ollama detected locally. API key is optional."
                      : "Ollama is installed but API is not running yet (start with `ollama serve`)."
                    : "Ollama binary not detected. Install it or provide a remote Ollama-compatible endpoint + key."}
                </div>
              ) : null}
              {selectedProviderKey === "lmstudio" && lmStudioStatus.checked ? (
                <div className="settings-muted" style={{ marginBottom: "8px" }}>
                  {lmStudioStatus.installed
                    ? lmStudioStatus.apiRunning
                      ? "LM Studio detected locally. API key is optional."
                      : "LM Studio is installed but API is not running yet (start local server on port 1234)."
                    : "LM Studio app not detected. Install it or provide a remote OpenAI-compatible endpoint + key."}
                </div>
              ) : null}
              {!isLocalOllama && !isLocalLmStudio ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <label style={{ margin: 0 }}>API key</label>
                    {selectedProviderPreset?.keyUrl ? (
                      <a
                        href={selectedProviderPreset.keyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "12px", color: "blue" }}
                      >
                        Get your Key ↗
                      </a>
                    ) : null}
                  </div>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={draftApiKey}
                    onChange={(e) => setDraftApiKey(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </>
              ) : null}
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
                disabled={!canAddProvider}
                onClick={() => {
                  const key = normalizeProviderName(draftProviderName);
                  if (!canAddProvider || providers[key]) return;
                  persistModelsJson({
                    ...modelsJson,
                    providers: {
                      ...providers,
                      [key]: {
                        ...emptyProviderConfig(),
                        api: draftApi,
                        baseUrl: draftBaseUrl.trim(),
                        apiKey: draftApiKey.trim(),
                      },
                    },
                  });
                  setIsAddProviderDialogOpen(false);
                  setDraftProviderPreset("");
                  setDraftProviderName("");
                  setDraftApi("openai-completions");
                  setDraftBaseUrl("");
                  setDraftApiKey("");
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
              <div
                className={`settings-provider-head ${!isCollapsed ? "settings-pm-card-head" : ""}`}
              >
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

                  <ModelScopePicker
                    models={providerModels.map((model) => ({
                      ...model,
                      supportsThinking: false,
                      thinkingLevels: [],
                    }))}
                    onToggleScope={onToggleScope}
                    emptyText={t('Aucun modèle détecté via `pi --list-models`.')}
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
