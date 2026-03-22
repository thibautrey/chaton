import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, Cloud, KeyRound, Users2 } from "lucide-react";
import { Link } from "react-router-dom";

import { buildLocalizedPath, getCloudCopy, type LanguageCode, LanguageSwitcher } from "./i18n";

export function CloudHeader({
  currentLanguage,
  onLanguageChange,
  showNav = true,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
  showNav?: boolean;
}) {
  const copy = getCloudCopy(currentLanguage);
  const homeHref = buildLocalizedPath(currentLanguage, "/");
  const pricingHref = buildLocalizedPath(currentLanguage, "/cloud/pricing");
  const signupHref = buildLocalizedPath(currentLanguage, "/cloud/signup");
  const loginHref = buildLocalizedPath(currentLanguage, "/cloud/login");

  return (
    <header className="site-header">
      {showNav ? (
        <nav className="site-nav" aria-label="Primary">
          <Link to={homeHref}>{copy.nav.home}</Link>
          <Link to={pricingHref}>{copy.nav.pricing}</Link>
          <Link to={signupHref}>{copy.nav.signUp}</Link>
          <Link to={loginHref}>{copy.nav.logIn}</Link>
          <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange} />
        </nav>
      ) : (
        <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange} />
      )}
    </header>
  );
}

export function CloudAuthShell({
  currentLanguage,
  onLanguageChange,
  form,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
  form: ReactNode;
}) {
  const copy = getCloudCopy(currentLanguage);

  return (
    <div className="landing-page cloud-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-top" />
      <div className="landing-orb landing-orb-bottom" />
      <CloudHeader currentLanguage={currentLanguage} onLanguageChange={onLanguageChange} showNav={false} />
      <main className="site-main cloud-main">
        <section className="cloud-auth-layout">
          <aside className="cloud-auth-story">
            <span className="marketing-eyebrow">{copy.shared.authPanelEyebrow}</span>
            <h1 className="cloud-auth-title">{copy.shared.authPanelTitle}</h1>
            <p className="hero-subtitle">{copy.shared.authPanelBody}</p>

            <div className="cloud-auth-story-list">
              {copy.shared.authPanelItems.map((item, index) => {
                const icons = [Cloud, Users2, KeyRound] as const;
                const Icon = icons[index] ?? Cloud;
                return (
                  <div key={item.title} className="cloud-auth-story-item">
                    <div className="cloud-auth-story-icon">
                      <Icon size={18} />
                    </div>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="cloud-auth-story-cta">
              <Link className="cloud-text-link" to={buildLocalizedPath(currentLanguage, "/cloud/pricing")}>
                {copy.nav.pricing}
                <ArrowRight size={14} />
              </Link>
            </div>
          </aside>

          <div className="cloud-auth-form-column">{form}</div>
        </section>
      </main>
    </div>
  );
}

export function CloudSetupStatus({
  currentLanguage,
  organizationReady,
  providersReady,
  desktopReady,
}: {
  currentLanguage: LanguageCode;
  organizationReady: boolean;
  providersReady: boolean;
  desktopReady: boolean;
}) {
  const copy = getCloudCopy(currentLanguage);
  const items = [
    {
      label: copy.onboarding.organizationStatus,
      ready: organizationReady,
    },
    {
      label: copy.onboarding.providersStatus,
      ready: providersReady,
    },
    {
      label: copy.onboarding.desktopStatus,
      ready: desktopReady,
    },
  ];

  return (
    <aside className="cloud-panel-shell cloud-panel cloud-setup-panel">
      <span className="marketing-eyebrow">{copy.onboarding.summaryEyebrow}</span>
      <h2 className="cloud-section-title">{copy.onboarding.summaryTitle}</h2>
      <p className="hero-subtitle">{copy.onboarding.summaryBody}</p>

      <div className="cloud-checklist">
        {items.map((item) => (
          <div key={item.label} className={`cloud-checklist-item ${item.ready ? "is-done" : ""}`}>
            <div className="cloud-checklist-icon">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <strong>{item.label}</strong>
              <p>{item.ready ? copy.onboarding.statusReady : copy.onboarding.statusPending}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="cloud-auth-story-list cloud-setup-hints">
        {copy.onboarding.summaryItems.map((item) => (
          <div key={item} className="cloud-auth-story-item">
            <div className="cloud-auth-story-icon">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <strong>{item}</strong>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
