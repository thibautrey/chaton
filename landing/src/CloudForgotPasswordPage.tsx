import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "./cloud";
import { buildLocalizedPath, getCloudCopy, type LanguageCode } from "./i18n";
import { CloudAuthShell } from "./CloudLayout";

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
    <CloudAuthShell
      currentLanguage={currentLanguage}
      onLanguageChange={onLanguageChange}
      form={
        <div className="cloud-form-shell">
          <div className="eyebrow">{copy.forgotPassword.eyebrow}</div>
          <h1 className="hero-title cloud-form-title">
            {copy.forgotPassword.title}
          </h1>
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
                  setError(
                    nextError instanceof Error
                      ? nextError.message
                      : String(nextError),
                  );
                })
                .finally(() => setPending(false));
            }}
          >
            <label className="cloud-field">
              <span>{copy.forgotPassword.email}</span>
              <input
                id="forgot-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={copy.forgotPassword.emailPlaceholder}
                type="email"
                autoComplete="email"
                aria-label={copy.forgotPassword.email}
                aria-invalid={error ? "true" : "false"}
                aria-describedby={
                  error ? "forgot-error" : done ? "forgot-success" : undefined
                }
              />
            </label>
            {error ? (
              <div
                id="forgot-error"
                className="cloud-inline-error"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            ) : null}
            {done ? (
              <div
                id="forgot-success"
                className="cloud-inline-success"
                role="status"
                aria-live="polite"
              >
                {copy.forgotPassword.success}
              </div>
            ) : null}
            <button
              className="cloud-primary-button"
              type="submit"
              disabled={pending}
              aria-busy={pending}
            >
              {pending
                ? copy.forgotPassword.pending
                : copy.forgotPassword.submit}
            </button>
            <Link
              className="cloud-text-link"
              to={buildLocalizedPath(currentLanguage, "/cloud/login")}
            >
              {copy.forgotPassword.backToLogin}
            </Link>
          </form>
        </div>
      }
    />
  );
}
