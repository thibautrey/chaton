import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ExternalLink } from "lucide-react";
import {
  addProviderToOrganization,
  getCloudAccount,
  markDesktopConnected,
  refreshCloudAccount,
  setActiveOrganization,
  upsertOrganization,
} from "./cloud";
import { buildLocalizedPath, getCloudCopy, type LanguageCode, LanguageSwitcher } from "./i18n";
import { CloudSetupStatus } from "./CloudLayout";
import { CloudStepPanel, type StepStatus } from "./cloud/CloudStepWizard";
import type { PlanOption } from "./cloud/CloudPlanCard";

type StepId = "organization" | "provider" | "desktop";

const PROVIDER_OPTIONS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google" },
  { id: "github-copilot", label: "GitHub Copilot" },
] as const;

export function CloudOnboardingPage({
  currentLanguage,
  onLanguageChange,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}) {
  const navigate = useNavigate();
  const copy = getCloudCopy(currentLanguage);
  const [account, setAccount] = useState(() => getCloudAccount());
  const activeOrganization =
    account?.organizations.find((organization) => organization.id === account.activeOrganizationId) ??
    account?.organizations[0] ??
    null;
  const [orgName, setOrgName] = useState(activeOrganization?.name ?? "");
  const [orgSlug, setOrgSlug] = useState(activeOrganization?.slug ?? "");
  const [plan, setPlan] = useState<"plus" | "pro" | "max">(account?.plan ?? "pro");
  const [providerKind, setProviderKind] = useState<(typeof PROVIDER_OPTIONS)[number]["id"]>("openai");
  const [providerSecret, setProviderSecret] = useState("");
  const [providerError, setProviderError] = useState("");
  const [organizationError, setOrganizationError] = useState("");
  const [organizationPending, setOrganizationPending] = useState(false);
  const [providerPending, setProviderPending] = useState(false);

  const organization = activeOrganization;
  const providerCount = organization?.providers.length ?? 0;
  const canConnectDesktop = Boolean(organization && providerCount > 0);

  const desktopLink = useMemo(() => {
    const url = new URL("chatons://cloud/connect");
    url.searchParams.set("base_url", "https://cloud.chatons.ai");
    return url.toString();
  }, []);

  useEffect(() => {
    void refreshCloudAccount()
      .then((next) => {
        setAccount(next);
        const nextActiveOrganization =
          next?.organizations.find((organization) => organization.id === next.activeOrganizationId) ??
          next?.organizations[0] ??
          null;
        if (nextActiveOrganization) {
          setOrgName(nextActiveOrganization.name);
          setOrgSlug(nextActiveOrganization.slug);
        }
        if (next?.plan) {
          setPlan(next.plan);
        }
      })
      .catch(() => {
        setAccount(getCloudAccount());
      });
  }, []);

  // Determine current step
  const currentStep: StepId = !organization
    ? "organization"
    : providerCount === 0
    ? "provider"
    : "desktop";

  const getStepStatus = (stepId: StepId): StepStatus => {
    const stepOrder: StepId[] = ["organization", "provider", "desktop"];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepId);

    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "active";
    return "pending";
  };

  const getCompletedMessage = (stepId: StepId): string | undefined => {
    if (stepId === "organization" && organization) {
      return `"${organization.name}" is ready`;
    }
    if (stepId === "provider" && providerCount > 0) {
      return `${providerCount} provider${providerCount > 1 ? "s" : ""} connected`;
    }
    return undefined;
  };

  // Plan options from i18n
  const planOptions: PlanOption[] = copy.onboarding.plans.map((p, i) => ({
    id: ["plus", "pro", "max"][i] as "plus" | "pro" | "max",
    label: p.label,
    detail: p.detail,
    monthlyPrice: copy.pricing.plans[i].monthlyPrice,
    annualPrice: copy.pricing.plans[i].annualPrice,
    highlight: copy.pricing.plans[i].highlight,
    audience: copy.pricing.plans[i].audience,
    bullets: copy.pricing.plans[i].bullets,
    cta: copy.pricing.plans[i].cta,
  }));

  if (!account) {
    navigate(buildLocalizedPath(currentLanguage, "/cloud/signup"));
    return null;
  }

  return (
    <div className="landing-page cloud-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-top" />
      <div className="landing-orb landing-orb-bottom" />
      <header className="site-header">
        <nav className="site-nav" aria-label="Primary">
          <button
            className="cloud-nav-button"
            type="button"
            onClick={() => navigate(buildLocalizedPath(currentLanguage, "/cloud"))}
          >
            Chatons Cloud
          </button>
          <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange} />
        </nav>
      </header>
      <main className="site-main cloud-main">
        <div className="cloud-onboarding-layout">
          {/* Left column: Status sidebar */}
          <aside className="cloud-onboarding-sidebar">
            <CloudSetupStatus
              currentLanguage={currentLanguage}
              organizationReady={Boolean(organization)}
              providersReady={providerCount > 0}
              desktopReady={canConnectDesktop}
            />
          </aside>

          {/* Right column: Step wizard */}
          <div className="cloud-onboarding-main">
            <div className="cloud-onboarding-header">
              <h1 className="hero-title">{copy.onboarding.setupTitle}</h1>
              <p className="hero-subtitle">{copy.onboarding.setupSubtitle}</p>
            </div>

            <div className="cloud-step-wizard-container">
              {/* Step 1: Organization */}
              <CloudStepPanel
                stepId="organization"
                currentStepId={currentStep}
                status={getStepStatus("organization")}
                eyebrow={copy.onboarding.steps.organization.eyebrow}
                title={copy.onboarding.steps.organization.title}
                subtitle={copy.onboarding.steps.organization.subtitle}
                completedMessage={getCompletedMessage("organization")}
              >
                {account.organizations.length > 1 ? (
                  <div className="cloud-field">
                    <label>
                      <span>{copy.onboarding.steps.organization.activeOrganization}</span>
                      <select
                        value={organization?.id ?? ""}
                        onChange={(event) => {
                          const nextOrganizationId = event.target.value;
                          if (!account) return;
                          void setActiveOrganization(account, nextOrganizationId).then((next) => {
                            setAccount(next);
                            const nextActiveOrg =
                              next.organizations.find((item) => item.id === next.activeOrganizationId) ??
                              next.organizations[0] ??
                              null;
                            if (nextActiveOrg) {
                              setOrgName(nextActiveOrg.name);
                              setOrgSlug(nextActiveOrg.slug);
                            }
                          });
                        }}
                      >
                        {account.organizations.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                <form
                  className="cloud-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!orgName.trim() || !orgSlug.trim()) return;
                    if (!account) return;
                    setOrganizationPending(true);
                    setOrganizationError("");
                    void upsertOrganization(account, {
                      organizationId: organization?.id ?? undefined,
                      name: orgName,
                      slug: orgSlug,
                      plan,
                    })
                      .then((next) => setAccount(next))
                      .catch((err) =>
                        setOrganizationError(err instanceof Error ? err.message : String(err))
                      )
                      .finally(() => setOrganizationPending(false));
                  }}
                >
                  <div className="cloud-field">
                    <label>
                      <span>{copy.onboarding.steps.organization.nameLabel}</span>
                      <input
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder={copy.onboarding.steps.organization.namePlaceholder}
                      />
                    </label>
                  </div>

                  <div className="cloud-field">
                    <label>
                      <span>{copy.onboarding.steps.organization.urlLabel}</span>
                      <div className="cloud-url-input-group">
                        <input
                          value={orgSlug}
                          onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                          placeholder={copy.onboarding.steps.organization.urlPlaceholder}
                          className="cloud-url-input"
                        />
                        <span className="cloud-url-suffix">.chatons.cloud</span>
                      </div>
                    </label>
                    {orgSlug && (
                      <span className="cloud-field-hint">
                        {copy.onboarding.steps.organization.urlPreview}: {orgSlug.toLowerCase()}.chatons.cloud
                      </span>
                    )}
                  </div>

                  <div className="cloud-section-label">{copy.onboarding.steps.organization.planLabel}</div>
                  <div className="cloud-plan-grid">
                    {planOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`cloud-plan-card ${plan === option.id ? "is-active" : ""}`}
                        onClick={() => setPlan(option.id)}
                      >
                        <strong>{option.label}</strong>
                        {option.highlight && <span className="cloud-plan-badge">{option.highlight}</span>}
                        <span className="cloud-plan-detail">{option.audience}</span>
                        <span className="cloud-plan-price">
                          {billingCycle === "annual" ? option.annualPrice : option.monthlyPrice}/mo
                        </span>
                      </button>
                    ))}
                  </div>

                  {organizationError && (
                    <div className="cloud-inline-error">{organizationError}</div>
                  )}

                  <button
                    className="cloud-primary-button cloud-button-full"
                    type="submit"
                    disabled={organizationPending || !orgName.trim() || !orgSlug.trim()}
                  >
                    {organizationPending
                      ? copy.onboarding.steps.organization.saving
                      : copy.onboarding.steps.organization.save}
                  </button>
                </form>
              </CloudStepPanel>

              {/* Step 2: Provider */}
              <CloudStepPanel
                stepId="provider"
                currentStepId={currentStep}
                status={getStepStatus("provider")}
                eyebrow={copy.onboarding.steps.provider.eyebrow}
                title={copy.onboarding.steps.provider.title}
                subtitle={copy.onboarding.steps.provider.subtitle}
                completedMessage={getCompletedMessage("provider")}
              >
                <form
                  className="cloud-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!organization || !providerSecret.trim()) return;
                    if (!account) return;
                    setProviderPending(true);
                    setProviderError("");
                    void addProviderToOrganization(account, organization.id, {
                      kind: providerKind,
                      label: PROVIDER_OPTIONS.find((p) => p.id === providerKind)?.label ?? providerKind,
                      secret: providerSecret,
                    })
                      .then((next) => {
                        setAccount(next);
                        setProviderSecret("");
                      })
                      .catch((err) =>
                        setProviderError(err instanceof Error ? err.message : String(err))
                      )
                      .finally(() => setProviderPending(false));
                  }}
                >
                  <div className="cloud-field">
                    <label>
                      <span>{copy.onboarding.steps.provider.providerLabel}</span>
                      <select
                        value={providerKind}
                        onChange={(e) => setProviderKind(e.target.value as typeof providerKind)}
                      >
                        {PROVIDER_OPTIONS.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="cloud-field">
                    <label>
                      <span>{copy.onboarding.steps.provider.secretLabel}</span>
                      <input
                        value={providerSecret}
                        onChange={(e) => setProviderSecret(e.target.value)}
                        placeholder={copy.onboarding.steps.provider.secretPlaceholder}
                        type="password"
                        autoComplete="off"
                      />
                    </label>
                  </div>

                  {providerError && <div className="cloud-inline-error">{providerError}</div>}

                  <button
                    className="cloud-primary-button cloud-button-full"
                    type="submit"
                    disabled={!organization || providerPending || !providerSecret.trim()}
                  >
                    {providerPending
                      ? copy.onboarding.steps.provider.adding
                      : copy.onboarding.steps.provider.add}
                  </button>
                </form>

                {/* Connected providers list */}
                {organization?.providers && organization.providers.length > 0 && (
                  <div className="cloud-provider-list">
                    <div className="cloud-provider-list-header">
                      {copy.onboarding.steps.provider.connectedProviders}
                    </div>
                    {organization.providers.map((provider) => (
                      <div key={provider.id} className="cloud-provider-item">
                        <div className="cloud-provider-item-info">
                          <Check size={16} className="cloud-provider-check" />
                          <strong>{provider.label}</strong>
                        </div>
                        <span className="cloud-provider-hint">
                          {copy.onboarding.steps.provider.secretPrefix} {provider.secretHint}...
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {organization?.providers?.length === 0 && (
                  <div className="cloud-provider-empty">{copy.onboarding.steps.provider.noProvider}</div>
                )}
              </CloudStepPanel>

              {/* Step 3: Desktop */}
              <CloudStepPanel
                stepId="desktop"
                currentStepId={currentStep}
                status={getStepStatus("desktop")}
                eyebrow={copy.onboarding.steps.desktop.eyebrow}
                title={copy.onboarding.steps.desktop.title}
                subtitle={copy.onboarding.steps.desktop.subtitle}
                completedMessage={getCompletedMessage("desktop")}
              >
                <div className="cloud-desktop-step-content">
                  <div className="cloud-desktop-info">
                    <h4>{copy.onboarding.steps.desktop.infoTitle}</h4>
                    <ol className="cloud-desktop-steps">
                      <li>{copy.onboarding.steps.desktop.step1}</li>
                      <li>{copy.onboarding.steps.desktop.step2}</li>
                      <li>{copy.onboarding.steps.desktop.step3}</li>
                    </ol>
                  </div>

                  <div className="cloud-desktop-actions">
                    <a
                      className={`cloud-primary-button cloud-button-wide ${canConnectDesktop ? "" : "is-disabled"}`}
                      href={canConnectDesktop ? desktopLink : undefined}
                      onClick={() => {
                        if (canConnectDesktop) {
                          markDesktopConnected(account);
                        }
                      }}
                    >
                      <ExternalLink size={16} />
                      {copy.onboarding.steps.desktop.openDesktop}
                    </a>
                    <button
                      className="cloud-secondary-button"
                      type="button"
                      onClick={() => navigate(buildLocalizedPath(currentLanguage, "/cloud"))}
                    >
                      {copy.onboarding.steps.desktop.backToPortal}
                    </button>
                  </div>

                  {!canConnectDesktop && (
                    <div className="cloud-desktop-prerequisites">
                      <div className="cloud-desktop-prerequisite">
                        {!organization && (
                          <span className="cloud-prerequisite-missing">
                            <span className="cloud-prerequisite-dot" />
                            {copy.onboarding.steps.desktop.prereqOrganization}
                          </span>
                        )}
                        {organization && providerCount === 0 && (
                          <span className="cloud-prerequisite-missing">
                            <span className="cloud-prerequisite-dot" />
                            {copy.onboarding.steps.desktop.prereqProvider}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CloudStepPanel>
            </div>

            {/* Completion banner */}
            {canConnectDesktop && organization && providerCount > 0 && (
              <div className="cloud-completion-banner">
                <div className="cloud-completion-icon">
                  <Check size={24} />
                </div>
                <div className="cloud-completion-content">
                  <h3>{copy.onboarding.completion.title}</h3>
                  <p>{copy.onboarding.completion.body}</p>
                </div>
                <div className="cloud-completion-actions">
                  <a
                    className="cloud-primary-button"
                    href={desktopLink}
                    onClick={() => markDesktopConnected(account)}
                  >
                    <ExternalLink size={16} />
                    {copy.onboarding.completion.cta}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// Billing cycle state (could be lifted to props if needed)
const billingCycle: "monthly" | "annual" = "monthly";
