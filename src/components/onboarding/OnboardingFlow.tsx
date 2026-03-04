import { useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';

import { workspaceIpc } from "@/services/ipc/workspace";
import { useWorkspace } from "@/features/workspace/store";
import { usePiSettingsStore } from "@/features/workspace/pi-settings-store";
import heroCat from '@/assets/chaton-hero.webm';

type PiModel = { id: string; provider: string; key: string; scoped: boolean };

type Step = 1 | 2 | 3;

type ProviderPreset = {
  label: string;
  provider: string;
  api: "openai-completions" | "openai-responses";
  baseUrl: string;
  keyUrl?: string;
};

const KNOWN_PROVIDER_ICON: Record<string, string> = {
  openai: "https://www.google.com/s2/favicons?sz=64&domain=openai.com",
  "openai-codex": "https://www.google.com/s2/favicons?sz=64&domain=openai.com",
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
  { label: "Mistral", provider: "mistral", api: "openai-completions", baseUrl: "https://api.mistral.ai/v1", keyUrl: "https://console.mistral.ai/codestral/cli" },
  { label: "Anthropic", provider: "anthropic", api: "openai-completions", baseUrl: "https://api.anthropic.com/v1", keyUrl: "https://console.anthropic.com/settings/keys" },
  { label: "Google", provider: "google", api: "openai-completions", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyUrl: "https://aistudio.google.com/app/apikey" },
  { label: "Groq", provider: "groq", api: "openai-completions", baseUrl: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys" },
  { label: "xAI", provider: "xai", api: "openai-completions", baseUrl: "https://api.x.ai/v1", keyUrl: "https://console.x.ai/" },
  { label: "Perplexity", provider: "perplexity", api: "openai-completions", baseUrl: "https://api.perplexity.ai", keyUrl: "https://www.perplexity.ai/settings/api" },
  { label: "Together", provider: "together", api: "openai-completions", baseUrl: "https://api.together.xyz/v1", keyUrl: "https://api.together.xyz/settings/api-keys" },
  { label: "DeepSeek", provider: "deepseek", api: "openai-completions", baseUrl: "https://api.deepseek.com/v1", keyUrl: "https://platform.deepseek.com/api_keys" },
  { label: "OpenRouter", provider: "openrouter", api: "openai-completions", baseUrl: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/keys" },
  { label: "OpenAI", provider: "openai-codex", api: "openai-responses", baseUrl: "https://api.openai.com/v1", keyUrl: "https://platform.openai.com/api-keys" },
  { label: "Custom", provider: "custom", api: "openai-completions", baseUrl: "" },
];

function normalizeProviderName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function buildProviderModel(
  _provider: string,
  id: string,
): { id: string; reasoning: boolean } {
  return { id, reasoning: true };
}

export function OnboardingFlow() {
  const { t } = useTranslation();
  const { state, updateSettings } = useWorkspace();
  const piSettings = usePiSettingsStore();
  const [step, setStep] = useState<Step>(1);
  const [provider, setProvider] = useState("mistral");
  const [apiType, setApiType] = useState<"openai-responses" | "openai-completions">("openai-completions");
  const [baseUrl, setBaseUrl] = useState("https://api.mistral.ai/v1");
  const [apiKey, setApiKey] = useState("");
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [models, setModels] = useState<PiModel[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canContinueProvider = useMemo(() => {
    return provider.trim().length > 0 && baseUrl.trim().length > 0;
  }, [provider, baseUrl]);

  const selectedProviderKey = normalizeProviderName(provider);
  const selectedProviderPreset = KNOWN_PROVIDER_PRESETS.find((p) => normalizeProviderName(p.provider) === selectedProviderKey);

  const loadModels = async () => {
    setIsLoadingModels(true);
    setErrorMessage(null);
    try {
      const res = await workspaceIpc.syncPiModels();
      if (!res.ok) {
        setErrorMessage(res.message ?? t("onboarding.error.cannotLoadModels"));
        return;
      }
      const providerModels = res.models.filter((m) => m.provider === selectedProviderKey);
      setModels(providerModels);
      setSelectedModels(new Set(providerModels.filter((m) => m.scoped).map((m) => m.key)));
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSaveProvider = async () => {
    if (!canContinueProvider) {
      return;
    }
    setIsSavingProvider(true);
    setErrorMessage(null);
    try {
      const snapshot = await workspaceIpc.getPiConfigSnapshot();
      const nextModels = {
        ...(snapshot.models ?? {}),
        providers: {
          ...(((snapshot.models ?? {}).providers ?? {}) as Record<string, unknown>),
          [selectedProviderKey]: {
            api: apiType,
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(),
            models: [
              buildProviderModel(selectedProviderKey, "gpt-5.3-codex"),
              buildProviderModel(selectedProviderKey, "gpt-5.2-codex"),
              buildProviderModel(selectedProviderKey, "gpt-5.1-codex"),
            ],
          },
        },
      } as Record<string, unknown>;

      const nextSettings = {
        ...(snapshot.settings ?? {}),
        defaultProvider: selectedProviderKey,
        defaultModel: "gpt-5.3-codex",
      } as Record<string, unknown>;

      const modelsSaved = await workspaceIpc.updatePiModelsJson(nextModels);
      if (!modelsSaved.ok) {
        setErrorMessage(modelsSaved.message);
        return;
      }
      const settingsSaved = await workspaceIpc.updatePiSettingsJson(nextSettings);
      if (!settingsSaved.ok) {
        setErrorMessage(settingsSaved.message);
        return;
      }

      setStep(2);
      await loadModels();
    } finally {
      setIsSavingProvider(false);
    }
  };

  const handleToggleModel = (key: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSaveScope = async () => {
    setErrorMessage(null);
    for (const model of models) {
      const shouldBeScoped = selectedModels.has(model.key);
      if (shouldBeScoped !== model.scoped) {
        const res = await workspaceIpc.setPiModelScoped(model.provider, model.id, shouldBeScoped);
        if (!res.ok) {
          setErrorMessage(res.message ?? t("onboarding.error.cannotSaveScope"));
          return;
        }
      }
    }
    setStep(3);
  };

  const handleRunTest = async () => {
    setIsTesting(true);
    setTestStatus("idle");
    setTestMessage("");
    setErrorMessage(null);
    try {
      const config = await workspaceIpc.getPiConfigSnapshot();
      if (!config.settings || !config.models) {
        setTestStatus("error");
        setTestMessage(t("onboarding.test.incompleteConfig"));
        return;
      }

      const result = await workspaceIpc.syncPiModels();
      if (!result.ok) {
        setTestStatus("error");
        setTestMessage(result.message ?? t("onboarding.test.cannotLoadModels"));
        return;
      }

      const scopedCount = result.models.filter((m) => m.scoped).length;
      if (result.models.length === 0) {
        setTestStatus("error");
        setTestMessage(t("onboarding.test.noModelsDetected"));
        return;
      }
      if (scopedCount === 0) {
        setTestStatus("error");
        setTestMessage(t("onboarding.test.noModelsInScope"));
        return;
      }
      setTestStatus("success");
      setTestMessage(t("onboarding.test.setupValidated"));
    } catch (error) {
      setTestStatus("error");
      setTestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsTesting(false);
    }
  };

  const handleFinish = async () => {
    await updateSettings({ ...state.settings, hasCompletedOnboarding: true });
    // Reload PI configuration to ensure the API key and settings are properly loaded
    await piSettings.refresh();
  };

  return (
    <div className="onboarding-shell">
      <div className="onboarding-animation">
        <video autoPlay loop muted playsInline className="onboarding-animation-video">
          <source src={heroCat} type="video/webm" />
        </video>
      </div>
      <div className="onboarding-card">
        <h1 className="onboarding-title">Welcome to Chatons</h1>
        <p className="onboarding-subtitle">
          3 quick steps. Then you can use Chatons.
        </p>

        <div className="onboarding-steps">
          <button
            type="button"
            className={step === 1 ? "active" : ""}
            onClick={() => setStep(1)}
            disabled={step === 1}
          >
            1. Provider
          </button>
          <button
            type="button"
            className={step === 2 ? "active" : ""}
            onClick={() => setStep(2)}
            disabled={step < 2}
          >
            2. Models
          </button>
          <button
            type="button"
            className={step === 3 ? "active" : ""}
            onClick={() => setStep(3)}
            disabled={step < 3}
          >
            3. Test
          </button>
        </div>

        {step === 1 ? (
          <section className="onboarding-section">
            <div className="onboarding-provider-grid">
              {KNOWN_PROVIDER_PRESETS.map((preset) => {
                const iconSrc = KNOWN_PROVIDER_ICON[normalizeProviderName(preset.provider)];
                const isSelected = normalizeProviderName(provider) === normalizeProviderName(preset.provider);
                return (
                  <button
                    key={preset.provider}
                    type="button"
                    className={`onboarding-provider-card group ${isSelected ? "is-selected" : ""}`}
                    onClick={() => {
                      setProvider(preset.provider);
                      setApiType(preset.api);
                      setBaseUrl(preset.baseUrl);
                    }}
                  >
                    {iconSrc ? <img src={iconSrc} alt="" loading="lazy" /> : <span>{preset.label.slice(0, 1)}</span>}
                    <strong>{preset.label}</strong>
                  </button>
                );
              })}
            </div>
            {provider === "custom" ? (
              <>
                <label>
                  Provider name
                  <input value={provider} onChange={(e) => setProvider(e.target.value)} />
                </label>
                <label>
                  API type
                  <select
                    value={apiType}
                    onChange={(e) => setApiType(e.target.value as "openai-responses" | "openai-completions")}
                  >
                    <option value="openai-responses">openai-responses</option>
                    <option value="openai-completions">openai-completions</option>
                  </select>
                </label>
                <label>
                  Base URL
                  <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                </label>
              </>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ margin: 0 }}>API key</label>
              {selectedProviderPreset?.keyUrl && (
                <a
                  href={selectedProviderPreset.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '12px', color: 'blue' }}
                >
                  Get your Key ↗
                </a>
              )}
            </div>
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ width: '100%' }}
            />
            <button disabled={!canContinueProvider || isSavingProvider} onClick={handleSaveProvider}>
              {isSavingProvider ? t("onboarding.saving") : t("onboarding.continue")}
            </button>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="onboarding-section">
            <p>{t("onboarding.selectModels")}</p>
            {isLoadingModels ? <p>{t("onboarding.loadingModels")}</p> : null}
            {!isLoadingModels && models.length === 0 ? (
              <p>{t("onboarding.noModelsFound")}</p>
            ) : null}
            <div className="onboarding-models">
              {models.map((model) => (
                <div key={model.key} className="onboarding-checkbox">
                  <input
                    type="checkbox"
                    id={`model-${model.key}`}
                    checked={selectedModels.has(model.key)}
                    onChange={() => handleToggleModel(model.key)}
                  />
                  <label htmlFor={`model-${model.key}`} className="onboarding-checkbox-label">
                    {model.id}
                  </label>
                </div>
              ))}
            </div>
            <button onClick={handleSaveScope}>{t("onboarding.continue")}</button>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="onboarding-section">
            <p>{t("onboarding.runTest")}</p>
            <button disabled={isTesting} onClick={handleRunTest}>
              {isTesting ? t("onboarding.testing") : t("onboarding.runTest")}
            </button>
            {testStatus === "success" ? <p className="ok">{testMessage}</p> : null}
            {testStatus === "error" ? <p className="error">{testMessage}</p> : null}
            <button disabled={testStatus !== "success"} onClick={handleFinish}>
              {t("onboarding.openChatons")}
            </button>
          </section>
        ) : null}

        {errorMessage ? <p className="error">{errorMessage}</p> : null}
      </div>
    </div>
  );
}
