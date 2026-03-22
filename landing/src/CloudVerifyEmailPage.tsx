import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyCloudEmail } from "./cloud";
import { buildLocalizedPath, getCloudCopy, type LanguageCode } from "./i18n";
import { CloudAuthShell } from "./CloudLayout";

export function CloudVerifyEmailPage({
  currentLanguage,
  onLanguageChange,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}) {
  const copy = getCloudCopy(currentLanguage);
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(copy.verifyEmail.missingToken);
      setPending(false);
      return;
    }
    void verifyCloudEmail({ token })
      .then(() => {
        setDone(true);
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        setPending(false);
      });
  }, [copy.verifyEmail.missingToken, token]);

  return (
    <CloudAuthShell
      currentLanguage={currentLanguage}
      onLanguageChange={onLanguageChange}
      form={
        <div className="cloud-form-shell">
          <div className="eyebrow">{copy.verifyEmail.eyebrow}</div>
          <h1 className="hero-title cloud-form-title">{copy.verifyEmail.title}</h1>
          <p className="hero-subtitle">{copy.verifyEmail.subtitle}</p>
          {pending ? <div className="cloud-inline-success">{copy.verifyEmail.pending}</div> : null}
          {done ? <div className="cloud-inline-success">{copy.verifyEmail.success}</div> : null}
          {error ? <div className="cloud-inline-error">{error}</div> : null}
          <div className="cloud-form">
            <Link className="cloud-primary-button" to={buildLocalizedPath(currentLanguage, "/cloud/login")}>
              {copy.verifyEmail.continueToLogin}
            </Link>
          </div>
        </div>
      }
    />
  );
}
