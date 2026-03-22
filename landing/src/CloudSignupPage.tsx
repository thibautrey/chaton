import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signupCloudAccount } from "./cloud";
import { buildLocalizedPath, getCloudCopy, type LanguageCode, LanguageSwitcher } from "./i18n";

export function CloudSignupPage({
  currentLanguage,
  onLanguageChange,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}) {
  const navigate = useNavigate();
  const copy = getCloudCopy(currentLanguage);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
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
          <div className="eyebrow">{copy.signup.eyebrow}</div>
          <h1 className="hero-title cloud-form-title">{copy.signup.title}</h1>
          <p className="hero-subtitle">{copy.signup.subtitle}</p>
          <form
            className="cloud-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!email.trim() || !fullName.trim() || !password.trim()) {
                return;
              }
              setPending(true);
              setError("");
              void signupCloudAccount({ email, fullName, password })
                .then(() => navigate(buildLocalizedPath(currentLanguage, "/cloud/onboarding")))
                .catch((nextError) => {
                  setError(nextError instanceof Error ? nextError.message : String(nextError));
                })
                .finally(() => setPending(false));
            }}
          >
            <label className="cloud-field">
              <span>{copy.signup.fullName}</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={copy.signup.fullNamePlaceholder} autoComplete="name" />
            </label>
            <label className="cloud-field">
              <span>{copy.signup.email}</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={copy.signup.emailPlaceholder} type="email" autoComplete="email" />
            </label>
            <label className="cloud-field">
              <span>{copy.signup.password}</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={copy.signup.passwordPlaceholder}
                type="password"
                autoComplete="new-password"
              />
            </label>
            {error ? <div className="cloud-inline-error">{error}</div> : null}
            <button className="cloud-primary-button" type="submit" disabled={pending}>
              {pending ? copy.signup.pending : copy.signup.submit}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
