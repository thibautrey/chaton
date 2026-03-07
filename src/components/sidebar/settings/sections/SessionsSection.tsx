import { useTranslation } from "react-i18next";

export function SessionsSection({
  sessionDir,
  openSessions,
}: {
  sessionDir: string;
  openSessions: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="settings-card">
      <h3 className="settings-card-title">{t("Sessions")}</h3>
      <div className="settings-card-note">
        {t("Session dir")}:{" "}
        <span className="settings-mono">
          {sessionDir || t("Local sessions")}
        </span>
      </div>
      <div className="settings-actions-row">
        <button
          type="button"
          className="settings-action"
          onClick={openSessions}
        >
          {t("Ouvrir dossier sessions")}
        </button>
        {/* <button
          type="button"
          className="settings-action"
          onClick={() => exportSession(sessionDir ? `${sessionDir}/chaton/session.jsonl` : 'session.jsonl')}
        >
          {t('Export HTML (exemple)')}
        </button> */}
      </div>
    </section>
  );
}
