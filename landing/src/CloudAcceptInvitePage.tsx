import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { acceptOrganizationInvite, getCloudAccount } from "./cloud";
import { buildLocalizedPath, type LanguageCode } from "./i18n";
import { CloudAuthShell } from "./CloudLayout";

export function CloudAcceptInvitePage({
  currentLanguage,
  onLanguageChange,
}: {
  currentLanguage: LanguageCode;
  onLanguageChange?: (code: LanguageCode) => void;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const account = getCloudAccount();

  return (
    <CloudAuthShell
      currentLanguage={currentLanguage}
      onLanguageChange={onLanguageChange}
      form={
        <div className="cloud-form-shell">
          <div className="eyebrow">Organization invite</div>
          <h1 className="hero-title cloud-form-title">Join a Chatons Cloud organization</h1>
          <p className="hero-subtitle">
            Accept the invitation to join this organization in Chatons Cloud.
          </p>
          {!token ? <div className="cloud-inline-error">Missing invite token.</div> : null}
          {error ? <div className="cloud-inline-error">{error}</div> : null}
          {!account ? (
            <div className="cloud-form">
              <Link
                className="cloud-primary-button"
                to={buildLocalizedPath(currentLanguage, `/cloud/login?return_to=${encodeURIComponent(`/cloud/accept-invite?token=${token}`)}`)}
              >
                Log in to continue
              </Link>
            </div>
          ) : (
            <div className="cloud-form">
              <button
                className="cloud-primary-button"
                type="button"
                disabled={pending || !token}
                onClick={() => {
                  if (!token) {
                    return;
                  }
                  setPending(true);
                  setError("");
                  void acceptOrganizationInvite(account, token)
                    .then(() => {
                      navigate(buildLocalizedPath(currentLanguage, "/cloud/onboarding"));
                    })
                    .catch((nextError) => {
                      setError(nextError instanceof Error ? nextError.message : String(nextError));
                    })
                    .finally(() => setPending(false));
                }}
              >
                {pending ? "Joining..." : "Accept invite"}
              </button>
            </div>
          )}
        </div>
      }
    />
  );
}
