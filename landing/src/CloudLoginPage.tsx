import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getCloudAccount, loginCloudAccount } from "./cloud";
import { buildLocalizedPath, getCloudCopy, type LanguageCode } from "./i18n";
import { CloudAuthShell } from "./CloudLayout";
import { getSafeReturnTo } from "./security";

export function CloudLoginPage({
  currentLanguage,
  onLanguageChange,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const copy = getCloudCopy(currentLanguage);
  const existing = getCloudAccount();
  const returnTo = new URLSearchParams(location.search).get("return_to")?.trim() ?? "";
  const safeReturnTo = getSafeReturnTo(returnTo);
  const [email, setEmail] = useState(existing?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <CloudAuthShell
      currentLanguage={currentLanguage}
      onLanguageChange={onLanguageChange}
      form={
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
                .then(() => {
                  if (safeReturnTo) {
                    navigate(safeReturnTo);
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
              <span>{copy.login.email}</span>
              <input 
                id="login-email"
                value={email} 
                onChange={(event) => setEmail(event.target.value)} 
                placeholder={copy.login.emailPlaceholder} 
                type="email" 
                autoComplete="email username"
                aria-label={copy.login.email}
                aria-invalid={error ? "true" : "false"}
                aria-describedby={error ? "login-error" : undefined}
              />
            </label>
            <label className="cloud-field">
              <span>{copy.login.password}</span>
              <input 
                id="login-password"
                value={password} 
                onChange={(event) => setPassword(event.target.value)} 
                placeholder={copy.login.passwordPlaceholder} 
                type="password" 
                autoComplete="current-password"
                aria-label={copy.login.password}
                aria-invalid={error ? "true" : "false"}
                aria-describedby={error ? "login-error" : undefined}
              />
            </label>
            {error ? (
              <div 
                id="login-error" 
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
              {pending ? copy.login.pending : copy.login.submit}
            </button>
            <Link className="cloud-text-link" to={buildLocalizedPath(currentLanguage, "/cloud/forgot-password")}>
              {copy.login.forgotPassword}
            </Link>
          </form>
        </div>
      }
    />
  );
}
