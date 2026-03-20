import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signupCloudAccount } from "./cloud";
import { type LanguageCode, LanguageSwitcher } from "./i18n";

export function CloudSignupPage({
  currentLanguage,
  onLanguageChange,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

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
        <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange} />
      </header>
      <main className="site-main cloud-main cloud-main-narrow">
        <div className="cloud-form-shell">
          <div className="eyebrow">Sign up</div>
          <h1 className="hero-title cloud-form-title">Create your cloud account</h1>
          <p className="hero-subtitle">
            This is the account your desktop app will connect to after browser login.
          </p>
          <form
            className="cloud-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!email.trim() || !fullName.trim()) {
                return;
              }
              setPending(true);
              setError("");
              void signupCloudAccount({ email, fullName })
                .then(() => navigate("/cloud/onboarding"))
                .catch((nextError) => {
                  setError(nextError instanceof Error ? nextError.message : String(nextError));
                })
                .finally(() => setPending(false));
            }}
          >
            <label className="cloud-field">
              <span>Full name</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Ada Lovelace" />
            </label>
            <label className="cloud-field">
              <span>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ada@team.dev" type="email" />
            </label>
            {error ? <div className="cloud-inline-error">{error}</div> : null}
            <button className="cloud-primary-button" type="submit" disabled={pending}>
              {pending ? "Creating account..." : "Continue to organization setup"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
