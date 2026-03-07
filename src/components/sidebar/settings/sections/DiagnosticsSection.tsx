import type { PiDiagnostics } from "@/features/workspace/types";
import { useTranslation } from "react-i18next";

export function DiagnosticsSection({
  diagnostics,
}: {
  diagnostics: PiDiagnostics | null;
}) {
  const { t } = useTranslation();

  return (
    <section className="settings-card">
      <h3 className="settings-card-title">{t("Diagnostic")}</h3>
      {diagnostics ? (
        <>
          <div className="settings-card-note">
            Pi: <span className="settings-mono">{diagnostics.piPath}</span>
          </div>
          <div className="settings-card-note">
            Settings:{" "}
            <span className="settings-mono">{diagnostics.settingsPath}</span>
          </div>
          <div className="settings-card-note">
            Models:{" "}
            <span className="settings-mono">{diagnostics.modelsPath}</span>
          </div>
          <div className="settings-list">
            {diagnostics.checks
              .filter((check) => check.id !== "pi-binary-not-found")
              .map((check) => (
                <div
                  key={check.id}
                  className={`settings-check settings-check-${check.level}`}
                >
                  {check.message}
                </div>
              ))}
          </div>
        </>
      ) : (
        <div className="settings-card-note">
          {t("Chargement diagnostics...")}
        </div>
      )}
      {/* <button type="button" className="settings-action" onClick={onRefresh}>{t('Rafraîchir')}</button> */}
    </section>
  );
}
