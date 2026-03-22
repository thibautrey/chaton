import { useEffect, useMemo, useState } from "react";
import {
  KNOWN_PROVIDER_PRESETS,
  KNOWN_PROVIDER_PRESET_GROUPS,
  normalizeProviderName,
  type ProviderPreset,
} from "@/features/workspace/provider-presets";
import { workspaceIpc } from "@/services/ipc/workspace";
import { OAuthConnectButton } from "./OAuthConnectButton";

type ProviderApiType =
  | "anthropic-messages"
  | "openai-responses"
  | "openai-completions"
  | "openai-codex-responses";

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
  const providerGroups = KNOWN_PROVIDER_PRESET_GROUPS;
  const matchedProviderGroup = useMemo(
    () =>
      providerGroups.find((group) =>
        group.presets.some(
          (preset) =>
            normalizeProviderName(preset.provider) ===
            normalizeProviderName(draft.providerPreset),
        ),
      ),
    [draft.providerPreset, providerGroups],
  );
  const [expandedGroupId, setExpandedGroupId] = useState(() => {
    return matchedProviderGroup?.id ?? providerGroups[0]?.id ?? "";
  });
  useEffect(() => {
    if (matchedProviderGroup?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedGroupId(matchedProviderGroup.id);
    }
  }, [matchedProviderGroup?.id]);
  const expandedGroup =
    providerGroups.find((group) => group.id === expandedGroupId) ??
    providerGroups[0];

  const selectProviderPreset = (preset: ProviderPreset) => {
    onDraftChange({
      providerPreset: preset.provider,
      providerName:
        preset.provider === "custom" ? "" : preset.provider,
      apiType: preset.api,
      baseUrl: preset.baseUrl,
      apiKey: draft.apiKey,
    });
    onSelectPreset?.(normalizeProviderName(preset.provider));
  };
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
        {providerGroups.map((group) => {
          const isGroupSelected = expandedGroupId === group.id;
          const isPreferredGroup = group.id === "mistral";
          return (
            <button
              key={`group-${group.id}`}
              type="button"
              className={`onboarding-provider-card group ${isGroupSelected ? "is-selected" : ""} ${
                isPreferredGroup ? "is-preferred" : ""
              }`}
              onClick={() => {
                setExpandedGroupId(group.id);
                if (group.presets.length === 1) {
                  selectProviderPreset(group.presets[0]);
                }
              }}
            >
              {isPreferredGroup ? (
                <span
                  className="onboarding-provider-preferred-star"
                  aria-hidden="true"
                >
                  ★
                </span>
              ) : null}
              {group.icon ? (
                <img src={group.icon} alt="" loading="lazy" />
              ) : (
                <span>{group.label.slice(0, 1)}</span>
              )}
              <strong>{group.label}</strong>
              {group.presets.length > 1 ? (
                <span className="onboarding-provider-group-count">
                  {group.presets.length} options
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {expandedGroup && expandedGroup.presets.length > 1 ? (
        <div className="onboarding-provider-subgrid" style={{ marginTop: "12px" }}>
          {expandedGroup.presets.map((preset) => {
            const isVariantSelected =
              normalizeProviderName(preset.provider) ===
              normalizeProviderName(draft.providerPreset);
            return (
              <button
                key={`variant-${preset.provider}`}
                type="button"
                className={`onboarding-provider-variant-card ${isVariantSelected ? "is-selected" : ""}`}
                onClick={() => selectProviderPreset(preset)}
              >
                <strong>{preset.label}</strong>
                <span className="onboarding-provider-variant-subtext">
                  {preset.oauthProvider
                    ? "OAuth-backed"
                    : preset.baseUrl || "Custom base URL"}
                </span>
                <span className="onboarding-provider-variant-auth">
                  {preset.oauthProvider ? "OAuth" : "API key"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

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
                <option value="anthropic-messages">anthropic-messages</option>
                <option value="openai-codex-responses">openai-codex-responses</option>
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
            <label>
              API key (optional)
              <input
                type={apiKeyInputType}
                placeholder={apiKeyPlaceholder}
                value={draft.apiKey}
                onChange={(e) =>
                  onDraftChange({ ...draft, apiKey: e.target.value })
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

        {!isLocalOllama && !isLocalLmStudio && !isOAuthConnected && draft.providerPreset !== "custom" ? (
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
