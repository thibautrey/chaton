import { Check, Cloud, FolderGit2, MessageSquareText } from "lucide-react";
import { useMemo, useState } from "react";

import { useTranslation } from "react-i18next";

export interface CloudInstance {
  id: string;
  name: string;
  baseUrl: string;
}

export interface CloudOrganizationOption {
  id: string;
  name: string;
  slug: string;
}

export interface CreateCloudProjectModalProps {
  instances: CloudInstance[];
  organizations: CloudOrganizationOption[];
  activeOrganizationId?: string | null;
  onConfirm: (data: {
    instanceId: string;
    projectName: string;
    organizationId: string;
    kind: "repository" | "conversation_only";
    repository?: {
      cloneUrl: string;
      defaultBranch: string | null;
      authMode: "none" | "token";
      accessToken: string | null;
    } | null;
  }) => void;
  onCancel: () => void;
}

type Step = 1 | 2 | 3;

export function CreateCloudProjectModal({
  instances,
  organizations,
  activeOrganizationId = null,
  onConfirm,
  onCancel,
}: CreateCloudProjectModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(1);
  const [selectedInstanceIndex, setSelectedInstanceIndex] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [organizationId, setOrganizationId] = useState(
    activeOrganizationId || organizations[0]?.id || "",
  );
  const [kind, setKind] = useState<"repository" | "conversation_only">(
    "conversation_only",
  );
  const [cloneUrl, setCloneUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [authMode, setAuthMode] = useState<"none" | "token">("none");
  const [repoAccessToken, setRepoAccessToken] = useState("");

  const selectedOrganization =
    organizations.find((item) => item.id === organizationId) ?? null;
  const selectedInstance = instances[selectedInstanceIndex] ?? instances[0];
  const repositoryNeedsToken = authMode === "token";
  const hasOrganizations = organizations.length > 0;

  const kindCards = useMemo(
    () => [
      {
        id: "conversation_only" as const,
        title: t("Conversation cloud"),
        icon: <MessageSquareText className="h-5 w-5" />,
        body: t(
          "Utilisez le cloud pour exécuter des conversations distantes sans dépôt Git attaché.",
        ),
        hint: t(
          "Idéal pour de la recherche, du support, ou des tâches agentiques sans repository.",
        ),
      },
      {
        id: "repository" as const,
        title: t("Projet repo distant"),
        icon: <FolderGit2 className="h-5 w-5" />,
        body: t(
          "Connectez un dépôt Git distant pour donner au runtime cloud un contexte de code partagé.",
        ),
        hint: t(
          "Idéal pour des projets d’équipe, des branches distantes, et des conversations liées au code.",
        ),
      },
    ],
    [t],
  );

  const canAdvanceFromStepOne = projectName.trim().length > 0;
  const canAdvanceFromStepTwo =
    hasOrganizations &&
    Boolean(organizationId.trim()) &&
    Boolean(selectedInstance?.id);
  const cloneUrlLooksValid =
    kind !== "repository" || /^https?:\/\//i.test(cloneUrl.trim());
  const canSubmit =
    canAdvanceFromStepOne &&
    canAdvanceFromStepTwo &&
    (kind !== "repository" || cloneUrlLooksValid);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedInstance) return;

    onConfirm({
      instanceId: selectedInstance.id,
      projectName: projectName.trim(),
      organizationId: organizationId.trim(),
      kind,
      repository:
        kind === "repository"
          ? {
              cloneUrl: cloneUrl.trim(),
              defaultBranch: defaultBranch.trim() || null,
              authMode,
              accessToken: repositoryNeedsToken
                ? repoAccessToken.trim() || null
                : null,
            }
          : null,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal cloud-project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-cloud-project-title"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <div>
              <h2 id="create-cloud-project-title" className="modal-title">
                {t("Créer un projet cloud")}
              </h2>
            </div>
            <div className="cloud-project-steps" aria-label={t("Progression")}>
              {[1, 2, 3].map((value) => (
                <span
                  key={value}
                  className={`cloud-project-step ${step === value ? "is-active" : ""} ${step > value ? "is-complete" : ""}`}
                >
                  {step > value ? <Check className="h-3.5 w-3.5" /> : value}
                </span>
              ))}
            </div>
          </div>

          <div className="modal-content cloud-project-modal-content">
            {step === 1 ? (
              <section className="cloud-project-stage">
                <div className="form-group">
                  <label htmlFor="project-name" className="form-label">
                    {t("Nom du projet")} *
                  </label>
                  <input
                    id="project-name"
                    type="text"
                    className="form-input"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder={t("Mon projet cloud")}
                    autoFocus
                    required
                  />
                  <span className="form-hint">
                    {t(
                      "Ce nom sera utilisé dans le workspace desktop et dans les conversations cloud associées.",
                    )}
                  </span>
                </div>

                <div className="cloud-project-kind-grid">
                  {kindCards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className={`cloud-project-kind-card ${kind === card.id ? "is-selected" : ""}`}
                      onClick={() => setKind(card.id)}
                    >
                      <div className="cloud-project-kind-icon">{card.icon}</div>
                      <div className="cloud-project-kind-copy">
                        <strong>{card.title}</strong>
                        <p>{card.body}</p>
                        <span>{card.hint}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {step === 2 ? (
              <section className="cloud-project-stage">
                <div className="cloud-project-stage-head">
                  <p>
                    {t(
                      "Choisissez l’organisation et l’instance cloud qui porteront ce projet.",
                    )}
                  </p>
                </div>

                {instances.length > 1 ? (
                  <div className="form-group">
                    <label htmlFor="instance-select" className="form-label">
                      {t("Instance cloud")}
                    </label>
                    <select
                      id="instance-select"
                      className="form-select"
                      value={selectedInstanceIndex}
                      onChange={(e) => {
                        setSelectedInstanceIndex(
                          Number.parseInt(e.target.value, 10),
                        );
                      }}
                    >
                      {instances.map((instance, index) => (
                        <option key={instance.id} value={index}>
                          {instance.name} ({instance.baseUrl})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="cloud-project-summary-card">
                    <div className="cloud-project-summary-title">
                      <Cloud className="h-4 w-4" />
                      <span>{t("Instance cloud")}</span>
                    </div>
                    <div className="cloud-project-summary-value">
                      {selectedInstance?.name ?? t("Instance inconnue")}
                    </div>
                    <div className="cloud-project-summary-note">
                      {selectedInstance?.baseUrl}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="organization-id" className="form-label">
                    {t("Organisation")}
                  </label>
                  {hasOrganizations ? (
                    <>
                      <select
                        id="organization-id"
                        className="form-select"
                        value={organizationId}
                        onChange={(e) => setOrganizationId(e.target.value)}
                      >
                        {organizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.name}
                          </option>
                        ))}
                      </select>
                      <span className="form-hint">
                        {selectedOrganization
                          ? t("Slug org: {{slug}}", {
                              slug: selectedOrganization.slug,
                            })
                          : t("Sélectionnez une organisation accessible")}
                      </span>
                    </>
                  ) : (
                    <div className="cloud-project-ready-card">
                      <strong>{t("Aucune organisation disponible")}</strong>
                      <p>
                        {t(
                          "Le desktop n’a reçu aucune organisation cloud. Rafraîchissez votre session cloud puis réessayez.",
                        )}
                      </p>
                    </div>
                  )}
                </div>

                <div className="cloud-project-summary-grid">
                  <div className="cloud-project-summary-card">
                    <div className="cloud-project-summary-title">
                      {t("Projet")}
                    </div>
                    <div className="cloud-project-summary-value">
                      {projectName || t("À définir")}
                    </div>
                  </div>
                  <div className="cloud-project-summary-card">
                    <div className="cloud-project-summary-title">
                      {t("Type")}
                    </div>
                    <div className="cloud-project-summary-value">
                      {kind === "repository"
                        ? t("Repo distant")
                        : t("Conversation uniquement")}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {step === 3 ? (
              <section className="cloud-project-stage">
                <div className="cloud-project-stage-head">
                  <h3>{t("3. Configuration runtime")}</h3>
                  <p>
                    {kind === "repository"
                      ? t(
                          "Ajoutez les détails du dépôt pour que le runtime cloud travaille dans le bon contexte de code.",
                        )
                      : t(
                          "Votre projet cloud est prêt. Vous pourrez démarrer une conversation distante dès la création terminée.",
                        )}
                  </p>
                </div>

                {kind === "repository" ? (
                  <>
                    <div className="form-group">
                      <label htmlFor="clone-url" className="form-label">
                        {t("URL HTTPS du dépôt")} *
                      </label>
                      <input
                        id="clone-url"
                        type="url"
                        className="form-input"
                        value={cloneUrl}
                        onChange={(e) => setCloneUrl(e.target.value)}
                        placeholder="https://github.com/org/repo.git"
                        required
                      />
                      <span className="form-hint">
                        {t(
                          "Utilisez une URL HTTP(S) accessible par le runtime cloud. Les URL SSH ne sont pas prises en charge ici.",
                        )}
                      </span>
                    </div>

                    <div className="cloud-project-summary-grid">
                      <div className="form-group">
                        <label htmlFor="default-branch" className="form-label">
                          {t("Branche par défaut")}
                        </label>
                        <input
                          id="default-branch"
                          type="text"
                          className="form-input"
                          value={defaultBranch}
                          onChange={(e) => setDefaultBranch(e.target.value)}
                          placeholder="main"
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="repo-auth-mode" className="form-label">
                          {t("Authentification")}
                        </label>
                        <select
                          id="repo-auth-mode"
                          className="form-select"
                          value={authMode}
                          onChange={(e) =>
                            setAuthMode(e.target.value as "none" | "token")
                          }
                        >
                          <option value="none">{t("Aucune")}</option>
                          <option value="token">{t("Token HTTPS")}</option>
                        </select>
                      </div>
                    </div>

                    {repositoryNeedsToken ? (
                      <div className="form-group">
                        <label
                          htmlFor="repo-access-token"
                          className="form-label"
                        >
                          {t("Token d’accès du dépôt")}
                        </label>
                        <input
                          id="repo-access-token"
                          type="password"
                          className="form-input"
                          value={repoAccessToken}
                          onChange={(e) => setRepoAccessToken(e.target.value)}
                          placeholder={t("Token optionnel pour le clone HTTPS")}
                        />
                        <span className="form-hint">
                          {t(
                            "Ajoutez un token si le dépôt n’est pas lisible anonymement depuis le runtime cloud.",
                          )}
                        </span>
                      </div>
                    ) : null}
                    {!cloneUrlLooksValid && cloneUrl.trim().length > 0 ? (
                      <div className="cloud-inline-error">
                        {t("Utilisez une URL de dépôt HTTP(S) valide.")}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="cloud-project-ready-card">
                    <strong>{t("Projet prêt à créer")}</strong>
                    <p>
                      {t(
                        "Une fois créé, le desktop ouvrira ce projet dans le workspace et vous pourrez lancer votre première conversation cloud.",
                      )}
                    </p>
                  </div>
                )}
              </section>
            ) : null}
          </div>

          <div className="modal-footer cloud-project-modal-footer">
            <button
              type="button"
              className="modal-btn modal-btn-secondary"
              onClick={() => {
                if (step === 1) {
                  onCancel();
                  return;
                }
                setStep((current) => (current - 1) as Step);
              }}
            >
              {step === 1 ? t("Annuler") : t("Retour")}
            </button>

            {step < 3 ? (
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={() => {
                  if (step === 1 && !canAdvanceFromStepOne) return;
                  if (step === 2 && !canAdvanceFromStepTwo) return;
                  setStep((current) => (current + 1) as Step);
                }}
                disabled={
                  (step === 1 && !canAdvanceFromStepOne) ||
                  (step === 2 && !canAdvanceFromStepTwo)
                }
              >
                {t("Continuer")}
              </button>
            ) : (
              <button
                type="submit"
                className="modal-btn modal-btn-primary"
                disabled={!canSubmit}
              >
                {t("Créer et démarrer")}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
