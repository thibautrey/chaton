import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCloudAccount, loginCloudAccount } from "./cloud";
import { buildLocalizedPath, getCloudCopy, type LanguageCode, LanguageSwitcher } from "./i18n";

export function CloudLoginPage({
  currentLanguage,
  onLanguageChange,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}) {
  const navigate = useNavigate();
  const copy = getCloudCopy(currentLanguage);
  const existing = getCloudAccount();
  const [email, setEmail] = useState(existing?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <div className="landing-page cloud-page">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-top" />
      <div className="landing-orb landing-orb-bottom" />
      <header className="site-header">
        <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange} />
      </header>
      <main className="site-main cloud-main cloud-main-narrow">
        <div className="cloud-form-shell">
          <div className="eyebrow">{copy.login.eyebrow}</div>
          <h1 className="hero-title cloud-form-title">{copy.login.title}</h1>
          <p className="hero-subtitle">{copy.login.subtitle}</p>
          <form
            className="cloud-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!email.trim() || !password.trim()) {
                return;
              }
              setPending(true);
              setError("");
              void loginCloudAccount({ email, password })
                .then(() => navigate(buildLocalizedPath(currentLanguage, "/cloud/onboarding")))
                .catch((nextError) => {
                  setError(nextError instanceof Error ? nextError.message : String(nextError));
                })
                .finally(() => setPending(false));
            }}
          >
            <label className="cloud-field">
              <span>{copy.login.email}</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={copy.login.emailPlaceholder} type="email" />
            </label>
            <label className="cloud-field">
              <span>{copy.login.password}</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder={copy.login.passwordPlaceholder} type="password" />
            </label>
            {error ? <div className="cloud-inline-error">{error}</div> : null}
            <button className="cloud-primary-button" type="submit" disabled={pending}>
              {pending ? copy.login.pending : copy.login.submit}
            </button>
            <Link className="cloud-text-link" to={buildLocalizedPath(currentLanguage, "/cloud/forgot-password")}>
              {copy.login.forgotPassword}
            </Link>
          </form>
        </div>
      </main>
    </div>
  );
}
