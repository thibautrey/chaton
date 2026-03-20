import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Clock3, Cloud, KeyRound, Layers3, RefreshCw, Users2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCloudAccount, refreshCloudAccount } from "./cloud";
import { type LanguageCode, LanguageSwitcher } from "./i18n";

export function CloudPortalPage({
  currentLanguage,
  onLanguageChange,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}) {
  const [account, setAccount] = useState(() => getCloudAccount());

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
        title: "Create your cloud account",
        body: "Connect desktop Chatons to your cloud workspace.",
        done: Boolean(account),
        icon: Cloud,
      },
      {
        title: "Create your organization",
        body: "Set up the shared workspace for your team.",
        done: Boolean(org),
        icon: Users2,
      },
      {
        title: "Connect providers",
        body: "Keep provider access and secrets at the organization level.",
        done: Boolean(org && org.providers.length > 0),
        icon: KeyRound,
      },
    ],
    [account, org],
  );

  const features = [
    {
      title: "Synced workspace",
      body: "Projects, settings and cloud state stay consistent across devices.",
      icon: RefreshCw,
    },
    {
      title: "Shared conversations",
      body: "Collaborate on the same projects and threads with your team.",
      icon: Users2,
    },
    {
      title: "Runs after you close the laptop",
      body: "Cloud conversations continue remotely until the work is done.",
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
          <Link to="/">Home</Link>
          <Link to="/cloud/signup">Sign up</Link>
          <Link to="/cloud/login">Log in</Link>
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
              Chatons for teams, with a runtime that stays online.
            </h1>
            <p className="hero-subtitle">
              Sync your workspace, collaborate on projects and conversations,
              and run cloud threads that keep going after your desktop closes.
            </p>

            <div className="cta-row">
              <Link className="cloud-primary-button" to={account ? "/cloud/onboarding" : "/cloud/signup"}>
                {account ? "Continue setup" : "Get started"}
                <ArrowRight size={16} />
              </Link>
              <Link className="cloud-secondary-button" to="/cloud/login">
                Log in
              </Link>
            </div>

            <div className="quick-links">
              <span className="quick-link">
                <RefreshCw size={16} />
                Settings sync
              </span>
              <span className="quick-link">
                <Users2 size={16} />
                Shared projects
              </span>
              <span className="quick-link">
                <KeyRound size={16} />
                Organization providers
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
                <strong>Organization-owned cloud control plane</strong>
                <p>
                  Providers, shared projects and long-running conversations live in one place.
                </p>
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
            <span className="marketing-eyebrow">Why cloud</span>
            <h2>Designed for shared, durable work.</h2>
            <p>
              Keep the desktop fast and polished while the workspace, runtime and provider access stay in the cloud.
            </p>
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
