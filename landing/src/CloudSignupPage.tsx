import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { signupCloudAccount } from "./cloud";
import { buildLocalizedPath, getCloudCopy, type LanguageCode } from "./i18n";
import { CloudAuthShell } from "./CloudLayout";

export function CloudSignupPage({
  currentLanguage,
  onLanguageChange,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const copy = getCloudCopy(currentLanguage);
  const returnTo = new URLSearchParams(location.search).get("return_to")?.trim() ?? "";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <CloudAuthShell
      currentLanguage={currentLanguage}
      onLanguageChange={onLanguageChange}
      form={
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
                .then(() => {
                  if (returnTo) {
                    window.location.assign(returnTo);
                    return;
                  }
                  navigate(buildLocalizedPath(currentLanguage, "/cloud/onboarding"));
                })
                .catch((nextError) => {
                  setError(nextError instanceof Error ? nextError.message : String(nextError));
                })
                .finally(() => setPending(false));
            }}
          >
            <label className="cloud-field">
              <span>{copy.signup.fullName}</span>
              <input 
                id="signup-fullName"
                value={fullName} 
                onChange={(event) => setFullName(event.target.value)} 
                placeholder={copy.signup.fullNamePlaceholder} 
                autoComplete="name"
                aria-label={copy.signup.fullName}
                aria-invalid={error ? "true" : "false"}
                aria-describedby={error ? "signup-error" : undefined}
              />
            </label>
            <label className="cloud-field">
              <span>{copy.signup.email}</span>
              <input 
                id="signup-email"
                value={email} 
                onChange={(event) => setEmail(event.target.value)} 
                placeholder={copy.signup.emailPlaceholder} 
                type="email" 
                autoComplete="email"
                aria-label={copy.signup.email}
                aria-invalid={error ? "true" : "false"}
                aria-describedby={error ? "signup-error" : undefined}
              />
            </label>
            <label className="cloud-field">
              <span>{copy.signup.password}</span>
              <input
                id="signup-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={copy.signup.passwordPlaceholder}
                type="password"
                autoComplete="new-password"
                aria-label={copy.signup.password}
                aria-invalid={error ? "true" : "false"}
                aria-describedby={error ? "signup-error" : undefined}
              />
            </label>
            {error ? (
              <div 
                id="signup-error" 
                className="cloud-inline-error" 
                role="alert" 
                aria-live="polite"
              >
                {error}
              </div>
            ) : null}
            <button 
              className="cloud-primary-button" 
              type="submit" 
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? copy.signup.pending : copy.signup.submit}
            </button>
            {returnTo ? (
              <Link className="cloud-text-link" to={buildLocalizedPath(currentLanguage, `/cloud/login?return_to=${encodeURIComponent(returnTo)}`)}>
                {copy.nav.logIn}
              </Link>
            ) : null}
          </form>
        </div>
      }
    />
  );
}
