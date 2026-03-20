import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Cloud, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { type LanguageCode, LanguageSwitcher } from "./i18n";
import { getCloudAccount, refreshCloudAccount } from "./cloud";

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
        body: "Provision a Chatons Cloud identity that your desktop app can bind to after browser auth.",
        done: Boolean(account),
        icon: Cloud,
      },
      {
        title: "Create your organization",
        body: "Define the shared org that will own projects, quotas, providers, secrets, and permissions.",
        done: Boolean(org),
        icon: ShieldCheck,
      },
      {
        title: "Connect providers",
        body: "Store model providers and secrets at the organization level so cloud projects never depend on local Pi config.",
        done: Boolean(org && org.providers.length > 0),
        icon: KeyRound,
      },
    ],
    [account, org],
  );

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
        <nav className="site-nav" aria-label="Primary">
          <Link to="/">Home</Link>
          <Link to="/cloud/signup">Sign up</Link>
          <Link to="/cloud/login">Log in</Link>
          <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange} />
        </nav>
      </header>

      <main className="site-main cloud-main">
        <section className="hero">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div className="eyebrow">
              <Sparkles size={14} />
              Shared projects, realtime runtime, org-owned providers
            </div>
            <h1 className="hero-title">Run Chatons in the cloud, not on one laptop.</h1>
            <p className="hero-subtitle">
              Create an organization, connect your providers once, invite your team,
              and let desktop Chatons attach through the browser with a secure callback flow.
            </p>
            <div className="cta-row">
              <div className="quick-links">
                <Link className="quick-link" to={account ? "/cloud/onboarding" : "/cloud/signup"}>
                  {account ? "Continue onboarding" : "Create your cloud account"}
                  <ArrowRight size={15} />
                </Link>
                <Link className="quick-link" to="/cloud/login">
                  I already have an account
                </Link>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="cloud-panel"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.06 }}
          >
            <div className="cloud-panel-shell">
              <div className="cloud-panel-header">
                <span className="cloud-panel-chip">cloud.chatons.ai</span>
                <span className="cloud-panel-chip is-muted">
                  {account ? "Account detected" : "Ready for signup"}
                </span>
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
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
