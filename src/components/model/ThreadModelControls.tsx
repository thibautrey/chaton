import { Brain, ChevronDown, Star } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";

import type { PiModel, ThinkingLevel } from "@/components/model/types";

type ThreadModelControlsProps = {
  models: PiModel[];
  selectedModelKey: string;
  selectedThinking?: ThinkingLevel;
  selectedAccessMode?: "secure" | "open";
  accessModeTooltip?: string;
  isLoadingModels: boolean;
  isUpdatingScope: boolean;
  onApplyModel: (modelKey: string) => Promise<void>;
  onToggleModelScoped: (model: { id: string; provider: string; scoped: boolean }) => Promise<void>;
  onThinkingChange: (level: ThinkingLevel) => Promise<void>;
  onAccessModeChange: (mode: "secure" | "open") => Promise<void>;
  t: (key: string) => string;
  showScopeToggle?: boolean;
  showThinking?: boolean;
  showAccessMode?: boolean;
  onOpenModelsMenu?: () => void;
};

export function ThreadModelControls({
  models,
  selectedModelKey,
  selectedThinking,
  selectedAccessMode,
  accessModeTooltip,
  isLoadingModels,
  isUpdatingScope,
  onApplyModel,
  onToggleModelScoped,
  onThinkingChange,
  onAccessModeChange,
  t,
  showScopeToggle = true,
  showThinking = true,
  showAccessMode = true,
  onOpenModelsMenu,
}: ThreadModelControlsProps) {
  const [modelsMenuOpen, setModelsMenuOpen] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const [modelFilterText, setModelFilterText] = useState("");
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const menusRef = useRef<HTMLDivElement | null>(null);
  const modelsMenuListContentRef = useRef<HTMLDivElement | null>(null);
  const [modelsMenuListHeight, setModelsMenuListHeight] = useState(0);
  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string | null>(null);

  useEffect(() => {
    const handleWindowClick = (event: MouseEvent) => {
      if (!menusRef.current) return;
      if (menusRef.current.contains(event.target as Node)) return;
      setModelsMenuOpen(false);
      setShowAllModels(false);
      setModelFilterText("");
      setSelectedProviderFilter(null);
      setThinkingMenuOpen(false);
    };

    window.addEventListener("mousedown", handleWindowClick);
    return () => window.removeEventListener("mousedown", handleWindowClick);
  }, []);

  // Get unique providers for filters
  const availableProviders = useMemo(() => {
    const providers = new Set<string>();
    (showAllModels ? models : models.filter((model) => model.scoped)).forEach((model) => {
      providers.add(model.provider);
    });
    return Array.from(providers).sort();
  }, [models, showAllModels]);

  const normalizedModelFilter = modelFilterText.trim().toLowerCase();
  const visibleModels = useMemo(
    () =>
      (showAllModels ? models : models.filter((model) => model.scoped))
        .filter((model) => {
          // Apply provider filter if selected
          if (selectedProviderFilter && model.provider !== selectedProviderFilter) {
            return false;
          }
          
          // Apply text filter
          if (!normalizedModelFilter) return true;
          return (
            model.id.toLowerCase().includes(normalizedModelFilter) ||
            model.provider.toLowerCase().includes(normalizedModelFilter) ||
            model.key.toLowerCase().includes(normalizedModelFilter)
          );
        }),
    [models, normalizedModelFilter, showAllModels, selectedProviderFilter],
  );

  const selectedModel = models.find((model) => model.key === selectedModelKey);
  const availableThinkingLevels = useMemo(
    () =>
      selectedModel?.supportsThinking && selectedModel.thinkingLevels.length > 0
        ? selectedModel.thinkingLevels
        : [],
    [selectedModel],
  );
  const supportsThinkingLevel = availableThinkingLevels.length > 0;
  const currentModelLabel = selectedModel?.id ?? selectedModelKey;

  useLayoutEffect(() => {
    if (!modelsMenuOpen) {
      return;
    }
    const content = modelsMenuListContentRef.current;
    if (!content) {
      return;
    }
    setModelsMenuListHeight(Math.min(content.scrollHeight, 260));
  }, [isLoadingModels, modelsMenuOpen, showAllModels, visibleModels.length]);

  return (
    <div className="flex items-center gap-1.5" ref={menusRef}>
      <div className="relative">
        <Badge
          variant="secondary"
          className="meta-chip cursor-pointer"
          role="button"
          tabIndex={0}
          onClick={() => {
            const nextOpen = !modelsMenuOpen;
            setModelsMenuOpen(nextOpen);
            if (nextOpen) {
              onOpenModelsMenu?.();
            }
            setThinkingMenuOpen(false);
            setModelFilterText("");
          }}
        >
          {currentModelLabel} <ChevronDown className="ml-1 h-4 w-4" />
        </Badge>

        {modelsMenuOpen ? (
          <div
            className="models-menu"
            role="menu"
            aria-label="Sélecteur de modèle"
          >
            {showAllModels ? (
              <div className="models-menu-search-wrap">
                <input
                  type="text"
                  className="models-menu-search"
                  placeholder="Filtrer les modèles..."
                  value={modelFilterText}
                  onChange={(event) => setModelFilterText(event.target.value)}
                />
              </div>
            ) : null}
            {showAllModels && availableProviders.length > 1 ? (
              <div className="models-menu-provider-filters">
                <div className="models-menu-provider-filters-scroll">
                  <button
                    type="button"
                    className={`models-menu-provider-filter ${selectedProviderFilter === null ? 'active' : ''}`}
                    onClick={() => setSelectedProviderFilter(null)}
                    title="Tous les fournisseurs"
                  >
                    Tous
                  </button>
                  {availableProviders.map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      className={`models-menu-provider-filter ${selectedProviderFilter === provider ? 'active' : ''}`}
                      onClick={() => setSelectedProviderFilter(provider)}
                      title={`Filtrer par ${provider}`}
                    >
                      {provider}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div
              className="models-menu-list"
              style={{ height: `${modelsMenuListHeight}px` }}
            >
              <div ref={modelsMenuListContentRef} className="models-menu-list-content">
                {isLoadingModels ? (
                  <div className="models-menu-empty">
                    Chargement des modèles...
                  </div>
                ) : visibleModels.length === 0 ? (
                  <div className="models-menu-empty">
                    {showAllModels ? (
                      selectedProviderFilter
                        ? `Aucun modèle disponible pour ${selectedProviderFilter}.`
                        : "Aucun modèle disponible."
                    ) : "Aucun modèle scoped. Cliquez sur more."}
                  </div>
                ) : (
                  visibleModels.map((model) => (
                    <div key={model.key} className="models-menu-row">
                      <button
                        type="button"
                        className={`models-menu-item ${selectedModelKey === model.key ? "models-menu-item-active" : ""}`}
                        onClick={() => void onApplyModel(model.key)}
                      >
                        <span>{model.id}</span>
                        <span className="models-menu-provider">
                          {model.provider}
                        </span>
                      </button>
                      {showAllModels && showScopeToggle ? (
                        <button
                          type="button"
                          className="models-scope-button"
                          aria-label={
                            model.scoped
                              ? "Retirer du scope"
                              : "Ajouter au scope"
                          }
                          onClick={() =>
                            void onToggleModelScoped(model)
                          }
                          disabled={isUpdatingScope}
                        >
                          <Star
                            className={`h-4 w-4 ${model.scoped ? "fill-current" : ""}`}
                          />
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="models-menu-header">
              <button
                type="button"
                className="models-more-button"
                onClick={() => {
                  setShowAllModels((show) => !show);
                  setModelFilterText("");
                  setSelectedProviderFilter(null);
                }}
              >
                {showAllModels ? "scoped only" : "more"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {showThinking && supportsThinkingLevel && selectedThinking ? (
        <div className="relative">
          <Badge
            variant="secondary"
            className="meta-chip cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => {
              setThinkingMenuOpen((open) => !open);
              setModelsMenuOpen(false);
              setShowAllModels(false);
            }}
          >
            <Brain className="h-4 w-4 mr-1" /> {selectedThinking}{" "}
            <ChevronDown className="ml-1 h-4 w-4" />
          </Badge>
          {thinkingMenuOpen && supportsThinkingLevel ? (
            <div
              className="thinking-menu"
              role="menu"
              aria-label="Sélecteur de réflexion"
            >
              {availableThinkingLevels.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`thinking-menu-item ${selectedThinking === level ? "thinking-menu-item-active" : ""}`}
                  onClick={() => void onThinkingChange(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showAccessMode && selectedAccessMode && accessModeTooltip ? (
        <div className="composer-access-mode-wrap">
          <div
            className="composer-access-mode-tooltip"
            id="composer-access-mode-tooltip"
            role="tooltip"
          >
            <p className="composer-access-mode-tooltip-title">{t("Quel mode choisir ?")}</p>
            <div className="composer-access-mode-tooltip-grid">
              <section className="composer-access-mode-tooltip-card">
                <p className="composer-access-mode-tooltip-label">{t("sécurisé")}</p>
                <ul className="composer-access-mode-tooltip-list">
                  <li>{t("Reste centré sur cette conversation.")}</li>
                  <li>{t("Le plus prudent pour la plupart des échanges.")}</li>
                </ul>
              </section>
              <section className="composer-access-mode-tooltip-card">
                <p className="composer-access-mode-tooltip-label">{t("ouvert")}</p>
                <ul className="composer-access-mode-tooltip-list">
                  <li>{t("Peut aller plus loin pour réaliser des tâches complètes.")}</li>
                  <li>{t("Pratique quand vous voulez une aide plus large.")}</li>
                </ul>
              </section>
            </div>
          </div>
          <div
            className="composer-access-mode"
            role="group"
            aria-label={t("Sélecteur de mode d’accès agent")}
            title={accessModeTooltip}
          >
            <button
              type="button"
              className={`composer-access-mode-btn ${selectedAccessMode === "secure" ? "is-active" : ""}`}
              onClick={() => void onAccessModeChange("secure")}
              aria-label={t("Passer en mode sécurisé")}
              aria-describedby="composer-access-mode-tooltip"
              title={t("Mode sécurisé: comportement actuel, accès limité au contexte de la conversation.")}
            >
              {t("sécurisé")}
            </button>
            <button
              type="button"
              className={`composer-access-mode-btn ${selectedAccessMode === "open" ? "is-active" : ""}`}
              onClick={() => void onAccessModeChange("open")}
              aria-label={t("Passer en mode ouvert")}
              aria-describedby="composer-access-mode-tooltip"
              title={t("Mode ouvert: Chaton peut accéder à des fichiers/dossiers hors contexte initial et exécuter les commandes nécessaires.")}
            >
              {t("ouvert")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
