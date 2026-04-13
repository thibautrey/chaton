import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
  Users2,
} from "lucide-react";

import {
  addProviderToOrganization,
  getCloudAccount,
  refreshCloudAccount,
  setActiveOrganization,
  upsertOrganization,
} from "./cloud";
import { buildLocalizedPath, getCloudCopy, type LanguageCode, LanguageSwitcher } from "./i18n";
import type { PlanOption } from "./cloud/CloudPlanCard";

type ProviderOption = {
  id: "openai" | "anthropic" | "google" | "github-copilot";
  label: string;
};

type AccountSectionId =
  | "organization"
  | "providers"
  | "subscription";

const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google" },
  { id: "github-copilot", label: "GitHub Copilot" },
];

const billingCycle: "monthly" | "annual" = "monthly";

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
  const [selectedSection, setSelectedSection] = useState<AccountSectionId>("organization");
  const activeOrganization =
    account?.organizations.find((organization) => organization.id === account.activeOrganizationId) ??
    account?.organizations[0] ??
    null;
  const [orgName, setOrgName] = useState(activeOrganization?.name ?? "");
  const [orgSlug, setOrgSlug] = useState(activeOrganization?.slug ?? "");
  const [plan, setPlan] = useState<"plus" | "pro" | "max">(account?.plan ?? "pro");
  const [providerKind, setProviderKind] = useState<ProviderOption["id"]>("openai");
  const [providerSecret, setProviderSecret] = useState("");
  const [providerError, setProviderError] = useState("");
  const [organizationError, setOrganizationError] = useState("");
  const [organizationPending, setOrganizationPending] = useState(false);
  const [providerPending, setProviderPending] = useState(false);

  const organization = activeOrganization;
  const providerCount = organization?.providers.length ?? 0;
  const desktopConnected = Boolean(account?.desktopConnectedAt);
  const setupCompletedCount = [Boolean(organization), providerCount > 0, desktopConnected].filter(Boolean).length;
  const setupProgressPercent = Math.round((setupCompletedCount / 3) * 100);
  const canConnectDesktop = Boolean(organization && providerCount > 0);

  const desktopLink = useMemo(() => {
    const url = new URL("chatons://cloud/connect");
    url.searchParams.set("base_url", account?.baseUrl ?? "https://cloud.chatons.ai");
    return url.toString();
  }, [account?.baseUrl]);

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

  useEffect(() => {
    if (!activeOrganization) {
      return;
    }
    setOrgName(activeOrganization.name);
    setOrgSlug(activeOrganization.slug);
  }, [activeOrganization?.id, activeOrganization?.name, activeOrganization?.slug]);

  useEffect(() => {
    if (account?.plan) {
      setPlan(account.plan);
    }
  }, [account?.plan]);

  const progressSteps = [
    {
      id: "organization" as const,
      title: copy.onboarding.organizationStatus,
      description: copy.onboarding.steps.organization.subtitle,
      ready: Boolean(organization),
      details: organization ? `"${organization.name}" ${copy.onboarding.statusReady.toLowerCase()}` : undefined,
    },
    {
      id: "providers" as const,
      title: copy.onboarding.providersStatus,
      description: copy.onboarding.steps.provider.subtitle,
      ready: providerCount > 0,
      details:
        providerCount > 0
          ? `${providerCount} provider${providerCount > 1 ? "s" : ""} connected`
          : copy.onboarding.statusPending,
    },
    {
      id: "desktop" as const,
      title: copy.onboarding.desktopStatus,
      description: copy.onboarding.steps.desktop.subtitle,
      ready: desktopConnected,
      details: desktopConnected ? copy.onboarding.statusReady : copy.onboarding.statusPending,
    },
  ];

  const planOptions: PlanOption[] = copy.onboarding.plans.map((copyPlan, index) => ({
    id: ["plus", "pro", "max"][index] as "plus" | "pro" | "max",
    label: copyPlan.label,
    detail: copyPlan.detail,
    monthlyPrice: copy.pricing.plans[index].monthlyPrice,
    annualPrice: copy.pricing.plans[index].annualPrice,
    highlight: copy.pricing.plans[index].highlight,
    audience: copy.pricing.plans[index].audience,
    bullets: copy.pricing.plans[index].bullets,
    cta: copy.pricing.plans[index].cta,
  }));

  const navigationSections: Array<{
    id: AccountSectionId;
    label: string;
    icon: typeof Users2;
    badge?: string;
  }> = [
    {
      id: "organization",
      label: copy.onboarding.organizationStatus,
      icon: Users2,
    },
    {
      id: "providers",
      label: copy.onboarding.providersStatus,
      icon: KeyRound,
      badge: providerCount > 0 ? String(providerCount) : undefined,
    },
    {
      id: "subscription",
      label: "Subscription",
      icon: ShieldCheck,
      badge: plan.toUpperCase(),
    },
  ];

  function focusSection(sectionId: AccountSectionId | "desktop-connection") {
    if (sectionId === "desktop-connection") {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setSelectedSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!account) {
    navigate(buildLocalizedPath(currentLanguage, "/cloud/signup"));
    return null;
  }

  const activePlanOption = planOptions.find((option) => option.id === plan) ?? planOptions[1];

  return (
    <div className="landing-page cloud-page cloud-account-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-top" />
      <div className="landing-orb landing-orb-bottom" />

      <header className="site-header">
        <nav className="site-nav cloud-account-topbar" aria-label="Primary">
          <div className="cloud-account-brand">
            <button
              className="cloud-nav-button"
              type="button"
              onClick={() => navigate(buildLocalizedPath(currentLanguage, "/cloud"))}
            >
              Chatons Cloud
            </button>
            <span className="cloud-account-context">
              {organization?.name ?? account.fullName}
            </span>
          </div>

          <div className="cloud-account-topbar-actions">
            <Link className="cloud-secondary-button cloud-account-link-button" to={buildLocalizedPath(currentLanguage, "/cloud/pricing")}>
              Pricing
            </Link>
            <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange} />
          </div>
        </nav>
      </header>

      <main className="site-main cloud-main">
        <div className="cloud-account-shell">
          <aside className="cloud-account-sidebar">
            <div className="cloud-account-sidebar-card">
              <div className="cloud-account-sidebar-header">
                <span className="cloud-account-sidebar-eyebrow">Workspace settings</span>
                <strong>{organization?.name ?? "Chatons Cloud"}</strong>
                <p>{account.email}</p>
              </div>

              <nav className="cloud-account-nav" aria-label="Account sections">
                {navigationSections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={`cloud-account-nav-item ${selectedSection === section.id ? "is-active" : ""}`}
                      onClick={() => setSelectedSection(section.id)}
                    >
                      <span className="cloud-account-nav-icon">
                        <Icon size={16} />
                      </span>
                      <span className="cloud-account-nav-label">{section.label}</span>
                      {section.badge ? <span className="cloud-account-nav-badge">{section.badge}</span> : null}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          <section className="cloud-account-main">
            <div className="cloud-account-summary cloud-panel-shell cloud-panel">
              <div className="cloud-account-summary-header">
                <div>
                  <span className="cloud-panel-chip">Workspace</span>
                  <h1 className="cloud-section-title">{organization?.name ?? "Configure your organization"}</h1>
                </div>
                <Link className="cloud-account-inline-link" to={buildLocalizedPath(currentLanguage, "/cloud/pricing")}>
                  View plans
                  <ArrowUpRight size={14} />
                </Link>
              </div>

              <div className="cloud-account-summary-grid">
                <div className="cloud-account-stat">
                  <span>Organization</span>
                  <strong>{organization?.slug ? `${organization.slug}.chatons.cloud` : "Not configured yet"}</strong>
                </div>
                <div className="cloud-account-stat">
                  <span>Providers</span>
                  <strong>{providerCount}</strong>
                </div>
                <div className="cloud-account-stat">
                  <span>Subscription</span>
                  <strong>{activePlanOption.label}</strong>
                </div>
                <div className="cloud-account-stat">
                  <span>Desktop app</span>
                  <strong>{desktopConnected ? "Connected" : "Not connected"}</strong>
                </div>
              </div>
            </div>

            <div className="cloud-account-overview-grid">
              <section className="cloud-panel-shell cloud-panel cloud-account-panel">
                <div className="cloud-account-panel-header">
                  <div>
                    <span className="cloud-panel-chip">Status</span>
                    <h2 className="cloud-section-title">Setup progress</h2>
                    <p className="hero-subtitle">Track the remaining steps before the workspace is fully usable.</p>
                  </div>
                </div>

                <div className="cloud-account-progress-card">
                  <div className="cloud-account-progress-header">
                    <div>
                      <strong>{setupCompletedCount} of 3 steps complete</strong>
                      <p>{copy.onboarding.setupSubtitle}</p>
                    </div>
                    <span className="cloud-account-progress-value">{setupProgressPercent}%</span>
                  </div>
                  <div className="cloud-account-progress-bar" aria-hidden="true">
                    <span style={{ width: `${setupProgressPercent}%` }} />
                  </div>
                </div>

                <div className="cloud-account-step-list">
                  {progressSteps.map((step, index) => (
                    <button
                      key={step.id}
                      type="button"
                      className={`cloud-account-step-card ${step.ready ? "is-done" : ""}`}
                      onClick={() => focusSection(step.id === "desktop" ? "desktop-connection" : step.id)}
                    >
                      <div className="cloud-account-step-index">
                        {step.ready ? <Check size={16} /> : <span>{index + 1}</span>}
                      </div>
                      <div className="cloud-account-step-copy">
                        <div className="cloud-account-step-title-row">
                          <strong>{step.title}</strong>
                          <span className={`cloud-account-status-pill ${step.ready ? "is-ready" : "is-pending"}`}>
                            {step.ready ? copy.onboarding.statusReady : copy.onboarding.statusPending}
                          </span>
                        </div>
                        <p>{step.description}</p>
                        <span className="cloud-account-step-detail">{step.details}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <aside className="cloud-account-side-stack">
                <section className="cloud-panel-shell cloud-panel cloud-account-panel">
                  <div className="cloud-account-panel-header">
                    <div>
                      <span className="cloud-panel-chip is-muted">Action queue</span>
                      <h2 className="cloud-section-title">Next actions</h2>
                    </div>
                  </div>

                  <div className="cloud-account-task-list">
                    {!organization ? (
                      <button type="button" className="cloud-account-task" onClick={() => focusSection("organization")}>
                        <span className="cloud-account-task-icon"><Users2 size={16} /></span>
                        <span>
                          <strong>Create the organization</strong>
                          <span>Set the workspace name and cloud URL.</span>
                        </span>
                      </button>
                    ) : null}
                    {providerCount === 0 ? (
                      <button type="button" className="cloud-account-task" onClick={() => focusSection("providers")}>
                        <span className="cloud-account-task-icon"><KeyRound size={16} /></span>
                        <span>
                          <strong>Connect at least one provider</strong>
                          <span>Organization credentials are shared across the workspace.</span>
                        </span>
                      </button>
                    ) : null}
                    {!desktopConnected ? (
                      <button type="button" className="cloud-account-task" onClick={() => focusSection("desktop-connection")}>
                        <span className="cloud-account-task-icon"><MonitorSmartphone size={16} /></span>
                        <span>
                          <strong>Link Chatons Desktop</strong>
                          <span>Open the desktop app when the organization is ready.</span>
                        </span>
                      </button>
                    ) : null}
                    {organization && providerCount > 0 && desktopConnected ? (
                      <div className="cloud-account-task is-complete">
                        <span className="cloud-account-task-icon"><CheckCircle2 size={16} /></span>
                        <span>
                          <strong>{copy.onboarding.completion.title}</strong>
                          <span>{copy.onboarding.completion.body}</span>
                        </span>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="cloud-panel-shell cloud-panel cloud-account-panel" id="desktop-connection">
                  <div className="cloud-account-panel-header">
                    <div>
                      <span className="cloud-panel-chip is-muted">Desktop app</span>
                      <h2 className="cloud-section-title">Connect the app</h2>
                    </div>
                  </div>

                  <div className="cloud-desktop-info">
                    <h4>{copy.onboarding.steps.desktop.infoTitle}</h4>
                    <ol className="cloud-desktop-steps">
                      <li>{copy.onboarding.steps.desktop.step1}</li>
                      <li>{copy.onboarding.steps.desktop.step2}</li>
                      <li>{copy.onboarding.steps.desktop.step3}</li>
                    </ol>
                  </div>

                  <div className="cloud-account-desktop-cta">
                    <a
                      className={`cloud-primary-button cloud-button-wide ${canConnectDesktop ? "" : "is-disabled"}`}
                      href={canConnectDesktop ? desktopLink : undefined}
                      onClick={(event) => {
                        if (!canConnectDesktop) {
                          event.preventDefault();
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

                  <div className="cloud-field-hint">
                    The desktop app confirms the connection only after Chatons Desktop completes authentication.
                  </div>

                  {!canConnectDesktop ? (
                    <div className="cloud-desktop-prerequisites">
                      {!organization ? (
                        <span className="cloud-prerequisite-missing">
                          <span className="cloud-prerequisite-dot" />
                          {copy.onboarding.steps.desktop.prereqOrganization}
                        </span>
                      ) : null}
                      {organization && providerCount === 0 ? (
                        <span className="cloud-prerequisite-missing">
                          <span className="cloud-prerequisite-dot" />
                          {copy.onboarding.steps.desktop.prereqProvider}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {desktopConnected ? (
                    <div className="cloud-account-inline-success">
                      <CheckCircle2 size={16} />
                      {copy.onboarding.completion.body}
                    </div>
                  ) : null}
                </section>
              </aside>
            </div>

            <div className="cloud-account-sections">
              <section
                className={`cloud-panel-shell cloud-panel cloud-account-panel ${selectedSection === "organization" ? "is-highlighted" : ""}`}
                id="organization"
              >
                <div className="cloud-account-panel-header">
                  <div>
                    <span className="cloud-panel-chip">{copy.onboarding.steps.organization.eyebrow}</span>
                    <h2 className="cloud-section-title">{copy.onboarding.steps.organization.title}</h2>
                    <p className="hero-subtitle">{copy.onboarding.steps.organization.subtitle}</p>
                  </div>
                </div>

                {account.organizations.length > 1 ? (
                  <div className="cloud-field">
                    <label>
                      <span>{copy.onboarding.steps.organization.activeOrganization}</span>
                      <select
                        value={organization?.id ?? ""}
                        onChange={(event) => {
                          const nextOrganizationId = event.target.value;
                          if (!account) {
                            return;
                          }
                          void setActiveOrganization(account, nextOrganizationId).then((next) => {
                            setAccount(next);
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
                    if (!orgName.trim() || !orgSlug.trim() || !account) {
                      return;
                    }
                    setOrganizationPending(true);
                    setOrganizationError("");
                    void upsertOrganization(account, {
                      organizationId: organization?.id ?? undefined,
                      name: orgName.trim(),
                      slug: orgSlug.trim(),
                      plan,
                    })
                      .then((next) => {
                        setAccount(next);
                        setSelectedSection("providers");
                      })
                      .catch((err) =>
                        setOrganizationError(err instanceof Error ? err.message : String(err))
                      )
                      .finally(() => setOrganizationPending(false));
                  }}
                >
                  <div className="cloud-account-form-grid">
                    <div className="cloud-field">
                      <label>
                        <span>{copy.onboarding.steps.organization.nameLabel}</span>
                        <input
                          value={orgName}
                          onChange={(event) => setOrgName(event.target.value)}
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
                            onChange={(event) =>
                              setOrgSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                            }
                            placeholder={copy.onboarding.steps.organization.urlPlaceholder}
                            className="cloud-url-input"
                          />
                          <span className="cloud-url-suffix">.chatons.cloud</span>
                        </div>
                      </label>
                      {orgSlug ? (
                        <span className="cloud-field-hint">
                          {copy.onboarding.steps.organization.urlPreview}: {orgSlug}.chatons.cloud
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {organizationError ? <div className="cloud-inline-error">{organizationError}</div> : null}

                  <div className="cloud-account-action-row">
                    <button
                      className="cloud-primary-button"
                      type="submit"
                      disabled={organizationPending || !orgName.trim() || !orgSlug.trim()}
                    >
                      {organizationPending
                        ? copy.onboarding.steps.organization.saving
                        : copy.onboarding.steps.organization.save}
                    </button>
                    {organization ? (
                      <span className="cloud-account-inline-success">
                        <CheckCircle2 size={16} />
                        {`"${organization.name}" is ready`}
                      </span>
                    ) : null}
                  </div>
                </form>
              </section>

              <section
                className={`cloud-panel-shell cloud-panel cloud-account-panel ${selectedSection === "subscription" ? "is-highlighted" : ""}`}
                id="subscription"
              >
                <div className="cloud-account-panel-header">
                  <div>
                    <span className="cloud-panel-chip">Subscription</span>
                    <h2 className="cloud-section-title">Subscription and billing</h2>
                    <p className="hero-subtitle">Manage the current plan, payment method, and upcoming billing work from one section.</p>
                  </div>
                </div>

                <div className="cloud-account-billing-grid">
                  <div className="cloud-account-billing-panel">
                    <span className="cloud-account-billing-label">Current subscription</span>
                    <strong>{activePlanOption.label}</strong>
                    <p>{activePlanOption.detail}</p>
                    <span className="cloud-account-billing-price">
                      {billingCycle === "annual" ? activePlanOption.annualPrice : activePlanOption.monthlyPrice}
                      <small>/mo</small>
                    </span>
                  </div>

                  <div className="cloud-account-billing-panel">
                    <span className="cloud-account-billing-label">Payment method</span>
                    <strong>Billing setup placeholder</strong>
                    <p>Add card capture, invoice history, and billing contacts here.</p>
                    <button type="button" className="cloud-secondary-button" disabled>
                      Add payment method
                    </button>
                  </div>
                </div>

                <div className="cloud-account-plan-grid">
                  {planOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`cloud-account-plan-card ${plan === option.id ? "is-active" : ""}`}
                      onClick={() => setPlan(option.id)}
                    >
                      <div className="cloud-account-plan-card-header">
                        <div>
                          <strong>{option.label}</strong>
                          <p>{option.audience}</p>
                        </div>
                        {option.highlight ? <span className="cloud-plan-badge">{option.highlight}</span> : null}
                      </div>
                      <div className="cloud-account-plan-price">
                        <span>{billingCycle === "annual" ? option.annualPrice : option.monthlyPrice}</span>
                        <small>/mo</small>
                      </div>
                      <p className="cloud-account-plan-detail">{option.detail}</p>
                    </button>
                  ))}
                </div>

                <div className="cloud-account-action-row">
                  <button
                    className="cloud-primary-button"
                    type="button"
                    disabled={!account || !organization}
                    onClick={() => {
                      if (!account || !organization) {
                        return;
                      }
                      setOrganizationPending(true);
                      setOrganizationError("");
                      void upsertOrganization(account, {
                        organizationId: organization.id,
                        name: orgName.trim() || organization.name,
                        slug: orgSlug.trim() || organization.slug,
                        plan,
                      })
                      .then((next) => {
                        setAccount(next);
                      })
                      .catch((err) =>
                        setOrganizationError(err instanceof Error ? err.message : String(err))
                      )
                        .finally(() => setOrganizationPending(false));
                    }}
                  >
                    Save plan
                  </button>
                  <span className="cloud-field-hint">Plan changes are stored at the organization level.</span>
                </div>
              </section>

              <section
                className={`cloud-panel-shell cloud-panel cloud-account-panel ${selectedSection === "providers" ? "is-highlighted" : ""}`}
                id="providers"
              >
                <div className="cloud-account-panel-header">
                  <div>
                    <span className="cloud-panel-chip">{copy.onboarding.steps.provider.eyebrow}</span>
                    <h2 className="cloud-section-title">{copy.onboarding.steps.provider.title}</h2>
                    <p className="hero-subtitle">{copy.onboarding.steps.provider.subtitle}</p>
                  </div>
                </div>

                <form
                  className="cloud-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!organization || !providerSecret.trim() || !account) {
                      return;
                    }
                    setProviderPending(true);
                    setProviderError("");
                    void addProviderToOrganization(account, organization.id, {
                      kind: providerKind,
                      label: PROVIDER_OPTIONS.find((provider) => provider.id === providerKind)?.label ?? providerKind,
                      secret: providerSecret,
                    })
                      .then((next) => {
                        setAccount(next);
                        setProviderSecret("");
                        document.getElementById("desktop-connection")?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      })
                      .catch((err) => setProviderError(err instanceof Error ? err.message : String(err)))
                      .finally(() => setProviderPending(false));
                  }}
                >
                  <div className="cloud-account-form-grid">
                    <div className="cloud-field">
                      <label>
                        <span>{copy.onboarding.steps.provider.providerLabel}</span>
                        <select
                          value={providerKind}
                          onChange={(event) => setProviderKind(event.target.value as ProviderOption["id"])}
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
                          onChange={(event) => setProviderSecret(event.target.value)}
                          placeholder={copy.onboarding.steps.provider.secretPlaceholder}
                          type="password"
                          autoComplete="off"
                        />
                      </label>
                    </div>
                  </div>

                  {providerError ? <div className="cloud-inline-error">{providerError}</div> : null}

                  <div className="cloud-account-action-row">
                    <button
                      className="cloud-primary-button"
                      type="submit"
                      disabled={!organization || providerPending || !providerSecret.trim()}
                    >
                      {providerPending ? copy.onboarding.steps.provider.adding : copy.onboarding.steps.provider.add}
                    </button>
                    <span className="cloud-field-hint">Connect providers once for the entire organization.</span>
                  </div>
                </form>

                {organization?.providers && organization.providers.length > 0 ? (
                  <div className="cloud-provider-list">
                    <div className="cloud-provider-list-header">{copy.onboarding.steps.provider.connectedProviders}</div>
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
                ) : (
                  <div className="cloud-provider-empty">{copy.onboarding.steps.provider.noProvider}</div>
                )}
              </section>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
