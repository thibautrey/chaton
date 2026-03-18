import { useEffect, useRef, useState } from "react";
import { workspaceIpc } from "@/services/ipc/workspace";

type OAuthEvent =
  | { type: "auth"; url?: string; instructions?: string }
  | {
      type: "prompt";
      message: string;
      placeholder?: string;
      allowEmpty?: boolean;
    }
  | { type: "progress"; message: string }
  | { type: "success" }
  | { type: "error"; message: string };

type OAuthStatus = "idle" | "logging_in" | "connected" | "error";

type OAuthConnectButtonProps = {
  providerId: string;
  providerLabel: string;
  /** Current credentials from auth.json — truthy means connected */
  isConnected: boolean;
  onConnected?: () => void;
};

export function OAuthConnectButton({
  providerId,
  providerLabel,
  isConnected,
  onConnected,
}: OAuthConnectButtonProps) {
  const [status, setStatus] = useState<OAuthStatus>(
    isConnected ? "connected" : "idle",
  );
  const [progressMessage, setProgressMessage] = useState("");
  const [authInstructions, setAuthInstructions] = useState("");
  const [prompt, setPrompt] = useState<{
    message: string;
    placeholder?: string;
    allowEmpty?: boolean;
  } | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Keep status in sync if isConnected prop changes
  useEffect(() => {
    if (isConnected && status === "idle") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("connected");
    }
    if (!isConnected && status === "connected") {
      setStatus("idle");
    }
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    setStatus("logging_in");
    setProgressMessage("");
    setAuthInstructions("");
    setPrompt(null);
    setPromptValue("");
    setErrorMessage("");

    // Subscribe to OAuth events from main process
    const unsub = workspaceIpc.onOAuthEvent((rawEvent) => {
      const event = rawEvent as OAuthEvent;
      if (event.type === "auth") {
        setAuthInstructions(
          event.instructions ??
            "Le navigateur va s'ouvrir pour terminer la connexion.",
        );
      } else if (event.type === "prompt") {
        setPrompt({
          message: event.message ?? "",
          placeholder: event.placeholder,
          allowEmpty: event.allowEmpty,
        });
        setPromptValue("");
      } else if (event.type === "progress") {
        setProgressMessage(event.message ?? "");
      } else if (event.type === "success") {
        setStatus("connected");
        setAuthInstructions("");
        setPrompt(null);
        onConnected?.();
      } else if (event.type === "error") {
        setStatus("error");
        setErrorMessage(event.message ?? "Erreur inconnue");
      }
    });
    unsubscribeRef.current = unsub;

    const result = await workspaceIpc.oauthLogin(providerId);
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;

    if (!result.ok) {
      if (status !== "connected") {
        setStatus("error");
        setErrorMessage(result.message ?? "Erreur de connexion OAuth");
      }
    }
  };

  const handleCancel = () => {
    workspaceIpc.oauthLoginCancel();
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setStatus("idle");
    setPrompt(null);
    setAuthInstructions("");
    setProgressMessage("");
  };

  const handlePromptSubmit = () => {
    workspaceIpc.oauthPromptReply(promptValue);
    setPrompt(null);
    setPromptValue("");
  };

  const handlePromptCancel = () => {
    workspaceIpc.oauthPromptCancel();
    setPrompt(null);
  };

  if (status === "connected") {
    return (
      <div className="oauth-connect-block">
        <div className="oauth-status oauth-status-connected">
          <span className="oauth-status-dot" />
          Connecté à {providerLabel}
        </div>
        <button
          type="button"
          className="oauth-disconnect-btn"
          onClick={() => setStatus("idle")}
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  if (status === "logging_in") {
    return (
      <div className="oauth-connect-block">
        {authInstructions ? (
          <p className="oauth-instructions">{authInstructions}</p>
        ) : (
          <p className="oauth-instructions">Connexion en cours…</p>
        )}

        {progressMessage ? (
          <p className="oauth-progress">{progressMessage}</p>
        ) : null}

        {prompt ? (
          prompt.allowEmpty ? (
            /* Optional prompt (e.g. GitHub Enterprise domain) — default is to skip */
            <div className="oauth-prompt">
              <button
                type="button"
                className="oauth-prompt-primary-action"
                autoFocus
                onClick={() => {
                  setPromptValue("");
                  handlePromptSubmit();
                }}
              >
                Continuer avec github.com
              </button>
              <details className="oauth-prompt-enterprise">
                <summary className="oauth-prompt-enterprise-toggle">
                  GitHub Enterprise (optionnel)
                </summary>
                <div className="oauth-prompt-enterprise-body">
                  <input
                    type="text"
                    className="oauth-prompt-input"
                    placeholder={prompt.placeholder ?? "company.ghe.com"}
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && promptValue.trim())
                        handlePromptSubmit();
                      if (e.key === "Escape") handlePromptCancel();
                    }}
                  />
                  <button
                    type="button"
                    className="oauth-btn-secondary"
                    disabled={!promptValue.trim()}
                    onClick={handlePromptSubmit}
                  >
                    Utiliser cette URL
                  </button>
                </div>
              </details>
            </div>
          ) : (
            /* Required prompt */
            <div className="oauth-prompt">
              <label className="oauth-prompt-label">{prompt.message}</label>
              <input
                autoFocus
                type="text"
                className="oauth-prompt-input"
                placeholder={prompt.placeholder ?? ""}
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePromptSubmit();
                  if (e.key === "Escape") handlePromptCancel();
                }}
              />
              <div className="oauth-prompt-actions">
                <button
                  type="button"
                  onClick={handlePromptSubmit}
                  disabled={!promptValue.trim()}
                >
                  Valider
                </button>
                <button
                  type="button"
                  className="oauth-btn-secondary"
                  onClick={handlePromptCancel}
                >
                  Annuler
                </button>
              </div>
            </div>
          )
        ) : null}

        <button
          type="button"
          className="oauth-cancel-btn"
          onClick={handleCancel}
        >
          Annuler la connexion
        </button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="oauth-connect-block">
        <p className="oauth-error">{errorMessage}</p>
        <button
          type="button"
          className="oauth-connect-btn"
          onClick={handleConnect}
        >
          Réessayer
        </button>
      </div>
    );
  }

  // idle
  return (
    <div className="oauth-connect-block">
      <button
        type="button"
        className="oauth-connect-btn"
        onClick={handleConnect}
      >
        Se connecter avec {providerLabel}
      </button>
    </div>
  );
}
