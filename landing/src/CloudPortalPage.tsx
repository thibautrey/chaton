import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Clock3, Cloud, KeyRound, Layers3, RefreshCw, Users2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCloudAccount, refreshCloudAccount } from "./cloud";
import { buildLocalizedPath, getCloudCopy, type LanguageCode, LanguageSwitcher } from "./i18n";

export function CloudPortalPage({
  currentLanguage,
  onLanguageChange,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}) {
  const [account, setAccount] = useState(() => getCloudAccount());
  const copy = getCloudCopy(currentLanguage);
  const homeHref = buildLocalizedPath(currentLanguage, "/");
  const signupHref = buildLocalizedPath(currentLanguage, "/cloud/signup");
  const loginHref = buildLocalizedPath(currentLanguage, "/cloud/login");
  const onboardingHref = buildLocalizedPath(currentLanguage, "/cloud/onboarding");

  useEffect(() => {
    void refreshCloudAccount()
      .then((next) => {
        setAccount(next);
      })
      .catch(() => {
        setAccount(getCloudAccount());
      });
  }, []);

  const org = account?.organizations[0] ?? null;

  const steps = useMemo(
    () => [
      {
        title: copy.portal.steps[0].title,
        body: copy.portal.steps[0].body,
        done: Boolean(account),
        icon: Cloud,
      },
      {
        title: copy.portal.steps[1].title,
        body: copy.portal.steps[1].body,
        done: Boolean(org),
        icon: Users2,
      },
      {
        title: copy.portal.steps[2].title,
        body: copy.portal.steps[2].body,
        done: Boolean(org && org.providers.length > 0),
        icon: KeyRound,
      },
    ],
    [account, copy.portal.steps, org],
  );

  const features = [
    {
      title: copy.portal.features[0].title,
      body: copy.portal.features[0].body,
      icon: RefreshCw,
    },
    {
      title: copy.portal.features[1].title,
      body: copy.portal.features[1].body,
      icon: Users2,
    },
    {
      title: copy.portal.features[2].title,
      body: copy.portal.features[2].body,
      icon: Clock3,
    },
  ] as const;

  return (
    <div className="landing-page cloud-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-top" />
      <div className="landing-orb landing-orb-bottom" />

      <header className="site-header">
        <nav className="site-nav" aria-label="Primary">
          <Link to={homeHref}>{copy.nav.home}</Link>
          <Link to={signupHref}>{copy.nav.signUp}</Link>
          <Link to={loginHref}>{copy.nav.logIn}</Link>
          <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange} />
        </nav>
      </header>

      <main className="site-main cloud-main">
        <section className="hero cloud-hero-simple">
          <motion.div
            className="hero-copy cloud-hero-copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <img
              className="cloud-hero-cat"
              src="/chaton-hero.gif"
              alt="Chatons cat icon"
              width={132}
              height={132}
            />
            <h1 className="hero-title">
              {copy.portal.title}
            </h1>
            <p className="hero-subtitle">{copy.portal.subtitle}</p>

            <div className="cta-row">
              <Link className="cloud-primary-button" to={account ? onboardingHref : signupHref}>
                {account ? copy.portal.primaryCtaConnected : copy.portal.primaryCta}
                <ArrowRight size={16} />
              </Link>
              <Link className="cloud-secondary-button" to={loginHref}>
                {copy.portal.secondaryCta}
              </Link>
            </div>

            <div className="quick-links">
              <span className="quick-link">
                <RefreshCw size={16} />
                {copy.portal.quickLinks[0]}
              </span>
              <span className="quick-link">
                <Users2 size={16} />
                {copy.portal.quickLinks[1]}
              </span>
              <span className="quick-link">
                <KeyRound size={16} />
                {copy.portal.quickLinks[2]}
              </span>
            </div>
          </motion.div>

          <motion.aside
            className="cloud-panel-shell cloud-panel cloud-hero-panel"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05, ease: "easeOut" }}
          >
            <div className="cloud-panel-summary">
              <div className="cloud-panel-summary-icon">
                <Layers3 size={18} />
              </div>
              <div>
                <strong>{copy.portal.panelTitle}</strong>
                <p>{copy.portal.panelBody}</p>
              </div>
            </div>

            <div className="cloud-checklist">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className={`cloud-checklist-item ${step.done ? "is-done" : ""}`}>
                    <div className="cloud-checklist-icon">
                      {step.done ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                    </div>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.aside>
        </section>

        <section className="cloud-feature-section" aria-label="Cloud features">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.35 }}
          >
            <span className="marketing-eyebrow">{copy.portal.featuresHeader}</span>
            <h2>{copy.portal.featuresTitle}</h2>
            <p>{copy.portal.featuresBody}</p>
          </motion.div>

          <div className="features">
          {features.map(({ title, body, icon: Icon }, index) => (
            <motion.article
              key={title}
              className="feature-card"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.35, delay: index * 0.08 }}
            >
              <div className="feature-icon">
                <Icon size={18} />
              </div>
              <h2>{title}</h2>
              <p>{body}</p>
            </motion.article>
          ))}
          </div>
        </section>
      </main>
    </div>
  );
}
