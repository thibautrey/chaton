import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ProviderSetupForm } from "@/components/model/ProviderSetupForm";
import { ScopedModelsSelector } from "@/components/model/ScopedModelsSelector";
import { workspaceIpc } from "@/services/ipc/workspace";
import { useWorkspace } from "@/features/workspace/store";
import { usePiSettingsStore } from "@/features/workspace/pi-settings-store";
import {
  KNOWN_PROVIDER_PRESETS,
  normalizeProviderName,
} from "@/features/workspace/provider-presets";
import heroCat from "@/assets/chaton-hero.webm";

type PiModel = { id: string; provider: string; key: string; scoped: boolean };

type Step = 0 | 1 | 2 | 3;

const INTRO_SLIDES = [
  {
    title: "Chatons is your personal AI assistant.",
    body: "It helps you plan, execute, and complete real tasks from one desktop workspace.",
  },
  {
    title: "It can do what you do on your computer, faster.",
    body: "Chatons can read files, run commands, and help you move from idea to result with less friction.",
  },
  {
    title: "It works for you in the background.",
    body: "Use automations and queued actions to reduce repetitive work in your day-to-day flow.",
  },
  {
    title: "It is highly extensible and customizable.",
    body: "Choose your providers, models, skills, and extensions to make Chatons fit the way you work.",
  },
] as const;

export function OnboardingFlow({ onFinish }: { onFinish?: () => void }) {
  const { t } = useTranslation();
  const { state, updateSettings } = useWorkspace();
  const piSettings = usePiSettingsStore();
  const [step, setStep] = useState<Step>(0);
  const [introIndex, setIntroIndex] = useState(0);
  const [providerPreset, setProviderPreset] = useState("mistral");
  const [providerName, setProviderName] = useState("mistral");
  const [apiType, setApiType] = useState<
    "openai-responses" | "openai-completions"
  >("openai-completions");
  const [baseUrl, setBaseUrl] = useState("https://api.mistral.ai/v1");
  const [apiKey, setApiKey] = useState("");
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [models, setModels] = useState<PiModel[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [testMessage, setTestMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authJson, setAuthJson] = useState<Record<string, unknown>>({});
  const providerFormRef = useRef<HTMLDivElement | null>(null);

  const selectedProviderKey = normalizeProviderName(providerName);

  // Determine if the selected preset supports OAuth
  const selectedPreset = KNOWN_PROVIDER_PRESETS.find(
    (p) =>
      normalizeProviderName(p.provider) ===
      normalizeProviderName(providerPreset),
  );
  const oauthProviderId = selectedPreset?.oauthProvider ?? null;
  const isOAuthConnected = oauthProviderId
    ? !!authJson[oauthProviderId]
    : false;

  const canContinueProvider = useMemo(() => {
    const hasName = providerName.trim().length > 0;
    const hasBase = baseUrl.trim().length > 0;
    if (!hasName || !hasBase) return false;
    // For OAuth-only providers (no keyUrl, has oauthProvider), require either OAuth or API key
    if (oauthProviderId && !selectedPreset?.keyUrl) {
      return isOAuthConnected || apiKey.trim().length > 0;
    }
    return true;
  }, [
    providerName,
    baseUrl,
    oauthProviderId,
    isOAuthConnected,
    apiKey,
    selectedPreset,
  ]);

  const scrollToProviderForm = () => {
    window.requestAnimationFrame(() => {
      providerFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  // Refresh auth status when an OAuth provider is selected
  useEffect(() => {
    if (!oauthProviderId) return;
    workspaceIpc
      .getPiAuthJson()
      .then((res) => {
        if (res.ok) setAuthJson(res.auth);
      })
      .catch(() => {});
  }, [oauthProviderId]);

  useEffect(() => {
    if (step !== 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setIntroIndex((current) => {
        if (current >= INTRO_SLIDES.length - 1) {
          return current;
        }
        return current + 1;
      });
    }, 6500);
    return () => window.clearInterval(timer);
  }, [step]);

  if (step === 0) {
    return (
      <div className="onboarding-shell onboarding-shell-intro">
        <div className="onboarding-animation onboarding-animation-intro">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="onboarding-animation-video"
          >
            <source src={heroCat} type="video/webm" />
          </video>
        </div>
        <div className="onboarding-intro-content">
          <h1 className="onboarding-title onboarding-title-intro">
            Welcome to Chatons
          </h1>

          <section className="onboarding-section onboarding-intro">
            <div key={`intro-${introIndex}`} className="onboarding-intro-copy">
              <h2 className="onboarding-intro-title">
                {INTRO_SLIDES[introIndex].title}
              </h2>
              <p className="onboarding-intro-body">
                {INTRO_SLIDES[introIndex].body}
              </p>
            </div>

            <div
              className="onboarding-intro-dots"
              role="tablist"
              aria-label="Onboarding intro slides"
            >
              {INTRO_SLIDES.map((_, index) => (
                <button
                  key={`intro-dot-${index}`}
                  type="button"
                  className={`onboarding-intro-dot ${introIndex === index ? "active" : ""}`}
                  onClick={() => setIntroIndex(index)}
                  aria-label={`Go to intro slide ${index + 1}`}
                />
              ))}
            </div>

            <div className="onboarding-intro-actions">
              <button
                type="button"
                className="onboarding-intro-secondary"
                onClick={() => setStep(1)}
              >
                Skip intro
              </button>
              <button
                type="button"
                onClick={() => {
                  if (introIndex < INTRO_SLIDES.length - 1) {
                    setIntroIndex((current) => current + 1);
                    return;
                  }
                  setStep(1);
                }}
              >
                {introIndex < INTRO_SLIDES.length - 1 ? "Next" : "Start setup"}
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const loadModels = async () => {
    setIsLoadingModels(true);
    setErrorMessage(null);
    try {
      const res = await workspaceIpc.syncPiModels();
      if (!res.ok) {
        setErrorMessage(res.message ?? t("onboarding.error.cannotLoadModels"));
        return;
      }
      const providerModels = res.models.filter(
        (m) => m.provider === selectedProviderKey,
      );
      setModels(providerModels);
      setSelectedModels(
        new Set(providerModels.filter((m) => m.scoped).map((m) => m.key)),
      );
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
      // For OAuth-connected providers, don't store apiKey in models.json
      const providerConfig: Record<string, unknown> = {
        api: apiType,
        baseUrl: baseUrl.trim(),
      };
      if (apiKey.trim() && !isOAuthConnected) {
        providerConfig.apiKey = apiKey.trim();
      }

      // Automatically discover models for the provider first
      setIsLoadingModels(true);
      const discoveryResult = await workspaceIpc.discoverProviderModels(
        providerConfig,
      );
      
      // Add discovered models to the provider config
      if (discoveryResult.ok && discoveryResult.models.length > 0) {
        providerConfig.models = discoveryResult.models.map((model) => {
          const entry: Record<string, unknown> = { id: model.id };
          if (typeof model.contextWindow === "number") {
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
      }

      const nextModels = {
        ...(snapshot.models ?? {}),
        providers: {
          ...(((snapshot.models ?? {}).providers ?? {}) as Record<
            string,
            unknown
          >),
          [selectedProviderKey]: providerConfig,
        },
      } as Record<string, unknown>;

      const nextSettings = {
        ...(snapshot.settings ?? {}),
        defaultProvider: selectedProviderKey,
        defaultModel: "",
      } as Record<string, unknown>;

      const modelsSaved = await workspaceIpc.updatePiModelsJson(nextModels);
      if (!modelsSaved.ok) {
        setErrorMessage(modelsSaved.message);
        return;
      }
      const settingsSaved =
        await workspaceIpc.updatePiSettingsJson(nextSettings);
      if (!settingsSaved.ok) {
        setErrorMessage(settingsSaved.message);
        return;
      }

      if (discoveryResult.ok && discoveryResult.models.length > 0) {
        setModels(
          discoveryResult.models.map((model) => ({
            ...model,
            key: `${model.provider}/${model.id}`,
            scoped: false,
          })),
        );
        setSelectedModels(
          new Set(
            discoveryResult.models
              .filter((m) => m.scoped)
              .map((m) => `${m.provider}/${m.id}`),
          ),
        );
      } else {
        // If discovery fails, still proceed and call loadModels
        await loadModels();
      }

      // Refresh the pi settings store to sync with saved models
      await piSettings.refresh();
      
      setStep(2);
    } finally {
      setIsSavingProvider(false);
      setIsLoadingModels(false);
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
        const res = await workspaceIpc.setPiModelScoped(
          model.provider,
          model.id,
          shouldBeScoped,
        );
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
    await updateSettings({
      ...state.settings,
      hasCompletedOnboarding: true,
      telemetryConsentAnswered:
        state.settings.telemetryConsentAnswered ?? false,
    });
    // Reload PI configuration to ensure the API key and settings are properly loaded
    await piSettings.refresh();
    onFinish?.();
  };

  return (
    <div className="onboarding-shell">
      <div className="onboarding-animation">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="onboarding-animation-video"
        >
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
            <div ref={providerFormRef}>
              <ProviderSetupForm
                draft={{
                  providerPreset,
                  providerName,
                  apiType,
                  baseUrl,
                  apiKey,
                }}
                onDraftChange={(next) => {
                  setProviderPreset(next.providerPreset);
                  setProviderName(next.providerName);
                  setApiType(next.apiType);
                  setBaseUrl(next.baseUrl);
                  setApiKey(next.apiKey);
                }}
                onSelectPreset={() => {
                  scrollToProviderForm();
                }}
                containerClassName=""
              />
            </div>
            <button
              disabled={!canContinueProvider || isSavingProvider}
              onClick={handleSaveProvider}
            >
              {isSavingProvider
                ? t("onboarding.saving")
                : t("onboarding.continue")}
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
            <ScopedModelsSelector
              models={models.map((model) => ({
                ...model,
                scoped: selectedModels.has(model.key),
              }))}
              onToggleScope={(model) => {
                handleToggleModel(model.key);
              }}
              emptyText={t("onboarding.error.cannotLoadModels")}
            />
            <button onClick={handleSaveScope}>
              {t("onboarding.continue")}
            </button>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="onboarding-section">
            <p>{t("onboarding.runTest")}</p>
            <button disabled={isTesting} onClick={handleRunTest}>
              {isTesting ? t("onboarding.testing") : t("onboarding.runTest")}
            </button>
            {testStatus === "success" ? (
              <p className="ok">{testMessage}</p>
            ) : null}
            {testStatus === "error" ? (
              <p className="error">{testMessage}</p>
            ) : null}
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
