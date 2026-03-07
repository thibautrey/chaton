import { useEffect, useState } from "react";
import {
  KNOWN_PROVIDER_ICON,
  KNOWN_PROVIDER_PRESETS,
  normalizeProviderName,
} from "@/features/workspace/provider-presets";
import { workspaceIpc } from "@/services/ipc/workspace";
import { OAuthConnectButton } from "./OAuthConnectButton";

type ProviderApiType = "openai-responses" | "openai-completions";

type ProviderStatus = {
  installed: boolean;
  apiRunning: boolean;
  checked: boolean;
};

type ProviderDraft = {
  providerPreset: string;
  providerName: string;
  apiType: ProviderApiType;
  baseUrl: string;
  apiKey: string;
};

type ProviderSetupFormProps = {
  draft: ProviderDraft;
  onDraftChange: (next: ProviderDraft) => void;
  showCustomFields?: boolean;
  apiKeyInputType?: "password" | "text";
  apiKeyPlaceholder?: string;
  apiKeyOptionalProviders?: string[];
  ollamaStatus?: ProviderStatus;
  lmStudioStatus?: ProviderStatus;
  onSelectPreset?: (providerKey: string) => void;
  containerClassName?: string;
  onOAuthConnected?: () => void;
};

export function ProviderSetupForm({
  draft,
  onDraftChange,
  showCustomFields = true,
  apiKeyInputType = "password",
  apiKeyPlaceholder = "sk-...",
  apiKeyOptionalProviders = ["ollama", "lmstudio", "custom"],
  ollamaStatus,
  lmStudioStatus,
  onSelectPreset,
  containerClassName = "onboarding-section mt-3",
  onOAuthConnected,
}: ProviderSetupFormProps) {
  const selectedProviderKey = normalizeProviderName(draft.providerName);
  const selectedProviderPreset = KNOWN_PROVIDER_PRESETS.find(
    (preset) =>
      normalizeProviderName(preset.provider) ===
      normalizeProviderName(draft.providerPreset),
  );
  const isLocalOllama =
    selectedProviderKey === "ollama" &&
    !!ollamaStatus?.checked &&
    !!ollamaStatus.installed &&
    !!ollamaStatus.apiRunning;
  const isLocalLmStudio =
    selectedProviderKey === "lmstudio" &&
    !!lmStudioStatus?.checked &&
    !!lmStudioStatus.installed &&
    !!lmStudioStatus.apiRunning;
  const isApiKeyOptional =
    apiKeyOptionalProviders.includes(selectedProviderKey) ||
    isLocalOllama ||
    isLocalLmStudio;

  // OAuth state
  const oauthProviderId = selectedProviderPreset?.oauthProvider ?? null;
  const [authJson, setAuthJson] = useState<Record<string, unknown>>({});
  const isOAuthConnected = oauthProviderId
    ? !!authJson[oauthProviderId]
    : false;

  // Load auth.json when an OAuth-capable provider is selected
  useEffect(() => {
    if (!oauthProviderId) return;
    workspaceIpc
      .getPiAuthJson()
      .then((res) => {
        if (res.ok) setAuthJson(res.auth);
      })
      .catch(() => {});
  }, [oauthProviderId]);

  const handleOAuthConnected = () => {
    workspaceIpc
      .getPiAuthJson()
      .then((res) => {
        if (res.ok) setAuthJson(res.auth);
      })
      .catch(() => {});
    onOAuthConnected?.();
  };

  return (
    <>
      <div className="onboarding-provider-grid">
        {KNOWN_PROVIDER_PRESETS.map((preset) => {
          const iconSrc =
            KNOWN_PROVIDER_ICON[normalizeProviderName(preset.provider)];
          const isSelected =
            normalizeProviderName(draft.providerPreset) ===
            normalizeProviderName(preset.provider);
          const isPreferred =
            normalizeProviderName(preset.provider) === "mistral";

          return (
            <button
              key={preset.provider}
              type="button"
              className={`onboarding-provider-card group ${isSelected ? "is-selected" : ""} ${isPreferred ? "is-preferred" : ""}`}
              onClick={() => {
                onDraftChange({
                  providerPreset: preset.provider,
                  providerName:
                    preset.provider === "custom" ? "" : preset.provider,
                  apiType: preset.api,
                  baseUrl: preset.baseUrl,
                  apiKey: draft.apiKey,
                });
                onSelectPreset?.(normalizeProviderName(preset.provider));
              }}
            >
              {isPreferred ? (
                <span
                  className="onboarding-provider-preferred-star"
                  aria-hidden="true"
                >
                  ★
                </span>
              ) : null}
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

      <div className={containerClassName}>
        {showCustomFields && draft.providerPreset === "custom" ? (
          <>
            <label>
              Provider name
              <input
                value={draft.providerName}
                onChange={(e) =>
                  onDraftChange({ ...draft, providerName: e.target.value })
                }
              />
            </label>
            <label>
              API type
              <select
                value={draft.apiType}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    apiType: e.target.value as ProviderApiType,
                  })
                }
              >
                <option value="openai-responses">openai-responses</option>
                <option value="openai-completions">openai-completions</option>
              </select>
            </label>
            <label>
              Base URL
              <input
                value={draft.baseUrl}
                onChange={(e) =>
                  onDraftChange({ ...draft, baseUrl: e.target.value })
                }
              />
            </label>
          </>
        ) : null}

        {selectedProviderKey === "ollama" && ollamaStatus?.checked ? (
          <div className="settings-muted" style={{ marginBottom: "8px" }}>
            {ollamaStatus.installed
              ? ollamaStatus.apiRunning
                ? "Ollama detected locally. API key is optional."
                : "Ollama is installed but API is not running yet (start with `ollama serve`)."
              : "Ollama binary not detected. Install it or provide a remote Ollama-compatible endpoint + key."}
          </div>
        ) : null}

        {selectedProviderKey === "lmstudio" && lmStudioStatus?.checked ? (
          <div className="settings-muted" style={{ marginBottom: "8px" }}>
            {lmStudioStatus.installed
              ? lmStudioStatus.apiRunning
                ? "LM Studio detected locally. API key is optional."
                : "LM Studio is installed but API is not running yet (start local server on port 1234)."
              : "LM Studio app not detected. Install it or provide a remote OpenAI-compatible endpoint + key."}
          </div>
        ) : null}

        {/* OAuth section — shown for OAuth-capable providers */}
        {oauthProviderId && !isLocalOllama && !isLocalLmStudio ? (
          <div style={{ marginBottom: "12px" }}>
            <OAuthConnectButton
              providerId={oauthProviderId}
              providerLabel={selectedProviderPreset?.label ?? oauthProviderId}
              isConnected={isOAuthConnected}
              onConnected={handleOAuthConnected}
            />
            {!isOAuthConnected ? (
              <div
                className="settings-muted"
                style={{ marginTop: "8px", marginBottom: "4px" }}
              >
                Ou entrez une clé API manuellement :
              </div>
            ) : null}
          </div>
        ) : null}

        {!isLocalOllama && !isLocalLmStudio && !isOAuthConnected ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "4px",
              }}
            >
              <label style={{ margin: 0 }}>
                API key
                {isApiKeyOptional || oauthProviderId ? " (optional)" : ""}
              </label>
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
              type={apiKeyInputType}
              placeholder={apiKeyPlaceholder}
              value={draft.apiKey}
              onChange={(e) =>
                onDraftChange({ ...draft, apiKey: e.target.value })
              }
              style={{ width: "100%" }}
            />
          </>
        ) : null}
      </div>
    </>
  );
}
