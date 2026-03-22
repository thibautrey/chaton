import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "./cloud";
import { buildLocalizedPath, getCloudCopy, type LanguageCode, LanguageSwitcher } from "./i18n";

export function CloudForgotPasswordPage({
  currentLanguage,
  onLanguageChange,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}) {
  const copy = getCloudCopy(currentLanguage);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

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
          <div className="eyebrow">{copy.forgotPassword.eyebrow}</div>
          <h1 className="hero-title cloud-form-title">{copy.forgotPassword.title}</h1>
          <p className="hero-subtitle">{copy.forgotPassword.subtitle}</p>
          <form
            className="cloud-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!email.trim()) {
                return;
              }
              setPending(true);
              setError("");
              void requestPasswordReset({ email })
                .then(() => setDone(true))
                .catch((nextError) => {
                  setError(nextError instanceof Error ? nextError.message : String(nextError));
                })
                .finally(() => setPending(false));
            }}
          >
            <label className="cloud-field">
              <span>{copy.forgotPassword.email}</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={copy.forgotPassword.emailPlaceholder} type="email" autoComplete="email" />
            </label>
            {error ? <div className="cloud-inline-error">{error}</div> : null}
            {done ? (
              <div className="cloud-inline-success">
                {copy.forgotPassword.success}
              </div>
            ) : null}
            <button className="cloud-primary-button" type="submit" disabled={pending}>
              {pending ? copy.forgotPassword.pending : copy.forgotPassword.submit}
            </button>
            <Link className="cloud-text-link" to={buildLocalizedPath(currentLanguage, "/cloud/login")}>
              {copy.forgotPassword.backToLogin}
            </Link>
          </form>
        </div>
      </main>
    </div>
  );
}
