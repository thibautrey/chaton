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

type ProviderApiType = "openai-completions" | "openai-responses";

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
            onClick={() => setIsAddProviderDialogOpen((open) => !open)}
          >
            {t("Ajouter provider")}
          </button>
        </div>
      </div>

      {isAddProviderDialogOpen ? (
        <div className="settings-subcard" style={{ marginBottom: "16px" }}>
          <div className="settings-subtitle">{t("Ajouter un provider")}</div>
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
          <div className="extension-modal-actions">
            <button
              type="button"
              className="extension-modal-btn"
              onClick={() => setIsAddProviderDialogOpen(false)}
            >
              {t("Annuler")}
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
              {t("Ajouter provider")}
            </button>
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
                      {t("{{scopedCount}} sur {{total}} dans le scope", {
                        scopedCount,
                        total: providerModels.length,
                      })}
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
