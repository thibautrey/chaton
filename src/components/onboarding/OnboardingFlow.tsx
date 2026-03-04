import { useMemo, useState } from "react";

import { workspaceIpc } from "@/services/ipc/workspace";
import { useWorkspace } from "@/features/workspace/store";

type PiModel = { id: string; provider: string; key: string; scoped: boolean };

type Step = 1 | 2 | 3;

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
  { label: "OpenAI", provider: "openai-codex", api: "openai-responses", baseUrl: "https://api.openai.com/v1" },
  { label: "Mistral", provider: "mistral", api: "openai-completions", baseUrl: "https://api.mistral.ai/v1" },
  { label: "Anthropic", provider: "anthropic", api: "openai-completions", baseUrl: "https://api.anthropic.com/v1" },
  { label: "Google", provider: "google", api: "openai-completions", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { label: "Groq", provider: "groq", api: "openai-completions", baseUrl: "https://api.groq.com/openai/v1" },
  { label: "xAI", provider: "xai", api: "openai-completions", baseUrl: "https://api.x.ai/v1" },
  { label: "Perplexity", provider: "perplexity", api: "openai-completions", baseUrl: "https://api.perplexity.ai" },
  { label: "Together", provider: "together", api: "openai-completions", baseUrl: "https://api.together.xyz/v1" },
  { label: "DeepSeek", provider: "deepseek", api: "openai-completions", baseUrl: "https://api.deepseek.com/v1" },
  { label: "OpenRouter", provider: "openrouter", api: "openai-completions", baseUrl: "https://openrouter.ai/api/v1" },
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
  const { state, updateSettings } = useWorkspace();
  const [step, setStep] = useState<Step>(1);
  const [provider, setProvider] = useState("openai-codex");
  const [apiType, setApiType] = useState<"openai-responses" | "openai-completions">("openai-responses");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
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

  const loadModels = async () => {
    setIsLoadingModels(true);
    setErrorMessage(null);
    try {
      const res = await workspaceIpc.syncPiModels();
      if (!res.ok) {
        setErrorMessage(res.message ?? "Impossible de charger les modèles.");
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
          setErrorMessage(res.message ?? "Impossible de sauvegarder le scope.");
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
        setTestMessage("Configuration Pi incomplète.");
        return;
      }

      const result = await workspaceIpc.syncPiModels();
      if (!result.ok) {
        setTestStatus("error");
        setTestMessage(result.message ?? "Impossible de charger les modèles.");
        return;
      }

      const scopedCount = result.models.filter((m) => m.scoped).length;
      if (result.models.length === 0) {
        setTestStatus("error");
        setTestMessage("Aucun modèle détecté. Vérifiez le provider et les modèles.");
        return;
      }
      if (scopedCount === 0) {
        setTestStatus("error");
        setTestMessage("Aucun modèle sélectionné dans le scope.");
        return;
      }
      setTestStatus("success");
      setTestMessage("Setup validé. Les modèles sont détectés et le scope est actif.");
    } catch (error) {
      setTestStatus("error");
      setTestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsTesting(false);
    }
  };

  const handleFinish = async () => {
    await updateSettings({ ...state.settings, hasCompletedOnboarding: true });
  };

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <h1 className="onboarding-title">Welcome to Chaton</h1>
        <p className="onboarding-subtitle">
          3 quick steps. Then you can use Chaton.
        </p>

        <div className="onboarding-steps">
          <span className={step === 1 ? "active" : ""}>1. Provider</span>
          <span className={step === 2 ? "active" : ""}>2. Models</span>
          <span className={step === 3 ? "active" : ""}>3. Test</span>
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
                    className={`onboarding-provider-card ${isSelected ? "is-selected" : ""}`}
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
            <label>
              API key
              <input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>
            <button disabled={!canContinueProvider || isSavingProvider} onClick={handleSaveProvider}>
              {isSavingProvider ? "Saving..." : "Continue"}
            </button>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="onboarding-section">
            <p>Select which models should be available in Chaton.</p>
            {isLoadingModels ? <p>Loading models...</p> : null}
            {!isLoadingModels && models.length === 0 ? (
              <p>No model found for this provider yet. Add models in settings later.</p>
            ) : null}
            <div className="onboarding-models">
              {models.map((model) => (
                <label key={model.key} className="onboarding-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedModels.has(model.key)}
                    onChange={() => handleToggleModel(model.key)}
                  />
                  <span>{model.id}</span>
                </label>
              ))}
            </div>
            <button onClick={handleSaveScope}>Continue</button>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="onboarding-section">
            <p>Run a quick test to verify your setup.</p>
            <button disabled={isTesting} onClick={handleRunTest}>
              {isTesting ? "Testing..." : "Run test"}
            </button>
            {testStatus === "success" ? <p className="ok">{testMessage}</p> : null}
            {testStatus === "error" ? <p className="error">{testMessage}</p> : null}
            <button disabled={testStatus !== "success"} onClick={handleFinish}>
              Open Chaton
            </button>
          </section>
        ) : null}

        {errorMessage ? <p className="error">{errorMessage}</p> : null}
      </div>
    </div>
  );
}
