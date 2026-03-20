import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addProviderToOrganization,
  getCloudAccount,
  markDesktopConnected,
  refreshCloudAccount,
  upsertOrganization,
} from "./cloud";
import { type LanguageCode, LanguageSwitcher } from "./i18n";

const PLAN_OPTIONS = [
  { id: "plus", label: "Plus", detail: "Great for a small shared workspace" },
  { id: "pro", label: "Pro", detail: "For active teams with multiple live sessions" },
  { id: "max", label: "Max", detail: "For larger orgs and heavy runtime concurrency" },
] as const;

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
  const [account, setAccount] = useState(() => getCloudAccount());
  const [orgName, setOrgName] = useState(account?.organizations[0]?.name ?? "");
  const [orgSlug, setOrgSlug] = useState(account?.organizations[0]?.slug ?? "");
  const [plan, setPlan] = useState<"plus" | "pro" | "max">(account?.plan ?? "pro");
  const [providerKind, setProviderKind] = useState<(typeof PROVIDER_OPTIONS)[number]["id"]>("openai");
  const [providerSecret, setProviderSecret] = useState("");
  const [providerError, setProviderError] = useState("");
  const [organizationError, setOrganizationError] = useState("");
  const [organizationPending, setOrganizationPending] = useState(false);
  const [providerPending, setProviderPending] = useState(false);

  const organization = account?.organizations[0] ?? null;
  const providerCount = organization?.providers.length ?? 0;
  const canConnectDesktop = Boolean(organization && providerCount > 0);

  const desktopLink = useMemo(() => {
    const base = "chatons://cloud/auth/callback";
    if (!account) {
      return base;
    }
    const url = new URL(base);
    url.searchParams.set("code", `cloud-web-${account.id}`);
    url.searchParams.set("state", organization?.id ?? `org-${account.id}`);
    url.searchParams.set("base_url", "https://cloud.chatons.ai");
    return url.toString();
  }, [account, organization]);

  useEffect(() => {
    void refreshCloudAccount()
      .then((next) => {
        setAccount(next);
        if (next?.organizations[0]) {
          setOrgName(next.organizations[0].name);
          setOrgSlug(next.organizations[0].slug);
        }
        if (next?.plan) {
          setPlan(next.plan);
        }
      })
      .catch(() => {
        setAccount(getCloudAccount());
      });
  }, []);

  if (!account) {
    navigate("/cloud/signup");
    return null;
  }

  return (
    <div className="landing-page cloud-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-top" />
      <div className="landing-orb landing-orb-bottom" />
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">C</span>
          <span>Chatons Cloud</span>
        </a>
        <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange} />
      </header>
      <main className="site-main cloud-main">
        <section className="cloud-onboarding-grid">
          <div className="cloud-form-shell">
            <div className="eyebrow">Organization setup</div>
            <h1 className="hero-title cloud-form-title">Create your shared cloud workspace</h1>
            <p className="hero-subtitle">
              Projects, permissions, runtime quotas, providers and secrets live at the organization level.
            </p>
            <form
              className="cloud-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!orgName.trim() || !orgSlug.trim()) {
                  return;
                }
                if (!account) {
                  return;
                }
                setOrganizationPending(true);
                setOrganizationError("");
                void upsertOrganization(account, { name: orgName, slug: orgSlug, plan })
                  .then((next) => {
                    setAccount(next);
                  })
                  .catch((nextError) => {
                    setOrganizationError(nextError instanceof Error ? nextError.message : String(nextError));
                  })
                  .finally(() => setOrganizationPending(false));
              }}
            >
              <label className="cloud-field">
                <span>Organization name</span>
                <input value={orgName} onChange={(event) => setOrgName(event.target.value)} placeholder="Acme Labs" />
              </label>
              <label className="cloud-field">
                <span>Slug</span>
                <input value={orgSlug} onChange={(event) => setOrgSlug(event.target.value)} placeholder="acme-labs" />
              </label>
              <div className="cloud-plan-grid">
                {PLAN_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`cloud-plan-card ${plan === option.id ? "is-active" : ""}`}
                    onClick={() => setPlan(option.id)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.detail}</span>
                  </button>
                ))}
              </div>
              {organizationError ? <div className="cloud-inline-error">{organizationError}</div> : null}
              <button className="cloud-primary-button" type="submit" disabled={organizationPending}>
                {organizationPending ? "Saving organization..." : "Save organization"}
              </button>
            </form>
          </div>

          <div className="cloud-form-shell">
            <div className="eyebrow">Providers</div>
            <h2 className="cloud-section-title">Add organization-owned providers</h2>
            <p className="hero-subtitle">
              These credentials stay in the cloud. Desktop Chatons only connects to the org, never to the provider directly for cloud projects.
            </p>
            <form
              className="cloud-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!organization || !providerSecret.trim()) {
                  return;
                }
                if (!account) {
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
                  })
                  .catch((nextError) => {
                    setProviderError(nextError instanceof Error ? nextError.message : String(nextError));
                  })
                  .finally(() => setProviderPending(false));
              }}
            >
              <label className="cloud-field">
                <span>Provider</span>
                <select value={providerKind} onChange={(event) => setProviderKind(event.target.value as typeof providerKind)}>
                  {PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cloud-field">
                <span>Secret or token</span>
                <input
                  value={providerSecret}
                  onChange={(event) => setProviderSecret(event.target.value)}
                  placeholder="sk-live-..."
                  type="password"
                />
              </label>
              {providerError ? <div className="cloud-inline-error">{providerError}</div> : null}
              <button className="cloud-primary-button" type="submit" disabled={!organization || providerPending}>
                {providerPending ? "Adding provider..." : "Add provider"}
              </button>
            </form>

            <div className="cloud-provider-list">
              {(organization?.providers ?? []).map((provider) => (
                <div key={provider.id} className="cloud-provider-item">
                  <strong>{provider.label}</strong>
                  <span>Secret prefix: {provider.secretHint}•••</span>
                </div>
              ))}
              {!organization?.providers?.length && (
                <div className="cloud-provider-empty">No provider configured yet.</div>
              )}
            </div>
          </div>
        </section>

        <section className="cloud-desktop-card">
          <div>
            <div className="eyebrow">Desktop connection</div>
            <h2 className="cloud-section-title">Connect your desktop app</h2>
            <p className="hero-subtitle">
              Once your org and provider are ready, the desktop app can attach through the browser and preserve the cloud session locally.
            </p>
          </div>
          <div className="cloud-desktop-actions">
            <a
              className={`cloud-primary-button ${canConnectDesktop ? "" : "is-disabled"}`}
              href={canConnectDesktop ? desktopLink : undefined}
              onClick={() => {
                if (canConnectDesktop) {
                  markDesktopConnected(account);
                }
              }}
            >
              Open in desktop Chatons
            </a>
            <button className="cloud-secondary-button" type="button" onClick={() => navigate("/cloud")}>
              Back to cloud portal
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
