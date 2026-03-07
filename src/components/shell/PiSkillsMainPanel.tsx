import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, RefreshCw, Search, Zap, Star, TrendingUp, Filter, X, GitBranch, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";

type ViewMode = 'marketplace' | 'installed';

type PiPackage = {
  source: string;
  path: string;
  installed: boolean;
};

type ExternalSkill = {
  source: string;
  title: string;
  description: string;
  author?: string;
  installs?: number;
  stars?: number;
  highlighted?: boolean;
  category?: string;
  tags?: string[];
  language?: string;
  lastUpdated?: string;
  createdAt?: string;
  featured?: boolean;
  popularity?: 'new' | 'trending' | 'popular' | 'recommended';
  repository?: string;
  documentation?: string;
  dependencies?: string[];
  rating?: { average: number; count: number };
};

// Helper to normalize skill data from API
function normalizeSkill(skill: any): ExternalSkill {
  return {
    ...skill,
    popularity: isValidPopularity(skill.popularity) ? skill.popularity : undefined,
  };
}

function isValidPopularity(value: any): value is 'new' | 'trending' | 'popular' | 'recommended' {
  return ['new', 'trending', 'popular', 'recommended'].includes(value);
}

function parsePiListOutput(stdout: string): PiPackage[] {
  const lines = stdout.split(/\r?\n/);
  const out: PiPackage[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const sourceMatch = lines[i].match(
      /^\s{2}([^\s].*?)\s*(\(filtered\))?\s*$/,
    );
    if (!sourceMatch) continue;

    const source = sourceMatch[1].trim();
    const installed = !sourceMatch[2];
    const next = lines[i + 1] ?? "";
    const pathMatch = next.match(/^\s{4}(.+)$/);
    const path = pathMatch ? pathMatch[1].trim() : "";

    out.push({ source, path, installed });
  }

  return out;
}

function formatSkillTitle(source: string): string {
  const raw = source.split(":").slice(1).join(":") || source;
  const leaf = raw.split("/").pop() || raw;
  return leaf
    .replace(/^pi-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSkillDescription(source: string): string {
  if (source.includes("gh-address-comments"))
    return "Address comments in a GitHub pull request";
  if (source.includes("gh-fix-ci"))
    return "Debug failing GitHub Actions CI checks";
  if (source.includes("linear"))
    return "Manage Linear issues and project workflows";
  if (source.includes("openai-docs"))
    return "Reference official OpenAI documentation";
  if (source.includes("playwright"))
    return "Automate browser flows from the CLI";
  if (source.includes("screenshot")) return "Capture screenshots";
  if (source.includes("pdf")) return "Create, edit, and review PDF files";
  if (source.includes("security"))
    return "Security reviews and secure-by-default guidance";
  return "Pi skill package";
}

function getSkillInitials(title: string): string {
  return (
    title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "PI"
  );
}

export function PiSkillsMainPanel() {
  const { t } = useTranslation();
  const { setNotice } = useWorkspace();
  const [viewMode, setViewMode] = useState<ViewMode>('marketplace');
  const [skills, setSkills] = useState<PiPackage[]>([]);
  const [catalog, setCatalog] = useState<ExternalSkill[]>([]);
  const [marketplace, setMarketplace] = useState<{
    featured?: ExternalSkill[]
    new?: ExternalSkill[]
    trending?: ExternalSkill[]
    byCategory?: Array<{ name: string; count: number; items: ExternalSkill[] }>
  } | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busySkill, setBusySkill] = useState<string | null>(null);
  
  // Advanced filtering state
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    language: '' as string,
    minInstalls: 0,
    category: '' as string,
    sortBy: 'trending' as 'trending' | 'installs' | 'stars' | 'recent' | 'rating',
  });
  const [filteredResults, setFilteredResults] = useState<ExternalSkill[]>([]);
  const [showFilteredView, setShowFilteredView] = useState(false);
  
  // Preview state
  const [previewSkill, setPreviewSkill] = useState<ExternalSkill | null>(null);
  const [skillRatings, setSkillRatings] = useState<Record<string, { average: number; count: number }>>({});
  const [userRating, setUserRating] = useState<Record<string, number>>({});
  const [ratingReview, setRatingReview] = useState<string>("");

  const loadSkills = async () => {
    setLoading(true);
    try {
      const result = await workspaceIpc.runPiCommand("list");
      if (!result.ok) {
        setNotice(
          result.message ??
            result.stderr ??
            t("Impossible de lister les compétences Pi."),
        );
        setLoading(false);
        return;
      }
      const parsed = parsePiListOutput(result.stdout);
      setSkills(parsed);
      
      const [catalogResult, marketplaceResult] = await Promise.all([
        workspaceIpc.listSkillsCatalog(),
        workspaceIpc.getSkillsMarketplace(),
      ]);
      
      setCatalog(catalogResult.entries ?? []);
      if (marketplaceResult.ok) {
        setMarketplace({
          featured: marketplaceResult.featured?.map(normalizeSkill),
          new: marketplaceResult.new?.map(normalizeSkill),
          trending: marketplaceResult.trending?.map(normalizeSkill),
          byCategory: marketplaceResult.byCategory?.map(cat => ({
            ...cat,
            items: cat.items.map(normalizeSkill),
          })),
        });
        // Load ratings for marketplace skills
        const allSkills = [
          ...(marketplaceResult.featured?.map(normalizeSkill) || []),
          ...(marketplaceResult.new?.map(normalizeSkill) || []),
          ...(marketplaceResult.trending?.map(normalizeSkill) || []),
          ...(marketplaceResult.byCategory?.flatMap(c => c.items.map(normalizeSkill)) || []),
        ];
        await loadSkillRatings(allSkills);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadSkillRatings = async (skills: ExternalSkill[]) => {
    const ratings: Record<string, { average: number; count: number }> = {};
    for (const skill of skills) {
      const result = await workspaceIpc.getSkillAverageRating(skill.source);
      ratings[skill.source] = result;
    }
    setSkillRatings(ratings);
  };

  const handleApplyFilters = useCallback(async () => {
    const result = await workspaceIpc.getSkillsMarketplaceFiltered({
      query: query.trim(),
      language: filters.language || undefined,
      category: filters.category || undefined,
      minInstalls: filters.minInstalls > 0 ? filters.minInstalls : undefined,
      sortBy: filters.sortBy,
      limit: 100,
    });
    
    if (result.ok) {
      const normalizedResults = (result.results || []).map(normalizeSkill);
      setFilteredResults(normalizedResults);
      setShowFilteredView(true);
      await loadSkillRatings(normalizedResults);
    }
  }, [query, filters]);

  useEffect(() => {
    void loadSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('.ep-search-input') as HTMLInputElement;
        searchInput?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFilters(!showFilters);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showFilters]);

  const installedSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return skills.filter((skill) => {
      if (!skill.installed) return false;
      if (!normalized) return true;
      const haystack =
        `${skill.source} ${formatSkillTitle(skill.source)} ${getSkillDescription(skill.source)}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, skills]);

  const discoverSkills = useMemo(() => {
    const installedSources = new Set(
      skills.filter((skill) => skill.installed).map((skill) => skill.source),
    );
    const normalized = query.trim().toLowerCase();
    return catalog.filter((skill) => {
      if (installedSources.has(skill.source)) return false;
      if (!normalized) return true;
      const haystack =
        `${skill.source} ${skill.title} ${skill.description} ${skill.author ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [catalog, query, skills]);

  const toggleSkill = async (skill: PiPackage) => {
    setBusySkill(skill.source);
    const action = skill.installed ? "remove" : "install";
    const result = await workspaceIpc.runPiCommand(action, {
      source: skill.source,
    });

    if (!result.ok) {
      setNotice(
        result.message ?? result.stderr ?? `Commande pi ${action} échouée.`,
      );
      setBusySkill(null);
      return;
    }

    setNotice(
      skill.installed
        ? t("{{name}} désinstallée.", { name: skill.source })
        : t("{{name}} installée.", { name: skill.source }),
    );
    await loadSkills();
    setBusySkill(null);
  };

  const installExternalSkill = async (skill: ExternalSkill) => {
    setBusySkill(skill.source);
    const result = await workspaceIpc.runPiCommand("install", {
      source: skill.source,
    });
    if (!result.ok) {
      setNotice(
        result.message ?? result.stderr ?? t("Installation impossible."),
      );
      setBusySkill(null);
      return;
    }
    setNotice(t("{{name}} installée.", { name: skill.source }));
    await loadSkills();
    setBusySkill(null);
  };

  const handleAddRating = async (skillSource: string, rating: number) => {
    const result = await workspaceIpc.addSkillRating(skillSource, rating, ratingReview);
    if (result) {
      setUserRating(prev => ({ ...prev, [skillSource]: rating }));
      setRatingReview("");
      setNotice(t("Évaluation enregistrée !"));
      // Reload ratings
      const avgRating = await workspaceIpc.getSkillAverageRating(skillSource);
      setSkillRatings(prev => ({ ...prev, [skillSource]: avgRating }));
    }
  };

  const installedSources = new Set(skills.filter(s => s.installed).map(s => s.source));

  return (
    <div className="ep-page">
      <div className="ep-topbar">
        <div className="ep-topbar-actions">
          <div className="ep-mode-switcher">
            <button
              type="button"
              className={`ep-mode-btn${viewMode === 'marketplace' ? ' ep-mode-btn-active' : ''}`}
              onClick={() => { setViewMode('marketplace'); setShowFilteredView(false); }}
            >
              <Zap className="h-4 w-4" />
              <span>{t('Marketplace')}</span>
            </button>
            <button
              type="button"
              className={`ep-mode-btn${viewMode === 'installed' ? ' ep-mode-btn-active' : ''}`}
              onClick={() => setViewMode('installed')}
            >
              <span>{t('Installées')} {skills.filter(s => s.installed).length > 0 && <span className="ep-mode-badge">{skills.filter(s => s.installed).length}</span>}</span>
            </button>
          </div>
          
          <button
            type="button"
            className={`ep-btn-ghost${showFilters ? ' ep-btn-ghost-active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title={t("Filtres (Ctrl+F)")}
          >
            <Filter className="h-4 w-4" />
            <span>{t("Filtres")}</span>
          </button>
          
          <button
            type="button"
            className="ep-btn-ghost"
            onClick={() => void loadSkills()}
            disabled={loading}
            title={t("Actualiser")}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span>{t("Actualiser")}</span>
          </button>
          
          <div className="ep-search-bar">
            <Search className="h-4 w-4 ep-search-icon" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Rechercher... (Ctrl+K)")}
              className="ep-search-input"
            />
          </div>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && viewMode === 'marketplace' && (
        <div className="ep-filters-panel">
          <div className="ep-filters-row">
            <div className="ep-filter-group">
              <label className="ep-filter-label">{t('Catégorie')}</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="ep-filter-select"
              >
                <option value="">{t('Toutes')}</option>
                <option value="AI & ML">AI & ML</option>
                <option value="Web & APIs">Web & APIs</option>
                <option value="Code Quality">Code Quality</option>
                <option value="Version Control">Version Control</option>
                <option value="Testing & Debug">Testing & Debug</option>
                <option value="CI/CD & Deployment">CI/CD & Deployment</option>
              </select>
            </div>

            <div className="ep-filter-group">
              <label className="ep-filter-label">{t('Langage')}</label>
              <select
                value={filters.language}
                onChange={(e) => setFilters({ ...filters, language: e.target.value })}
                className="ep-filter-select"
              >
                <option value="">{t('Tous')}</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="go">Go</option>
                <option value="rust">Rust</option>
                <option value="bash">Bash</option>
              </select>
            </div>

            <div className="ep-filter-group">
              <label className="ep-filter-label">{t('Min. Installations')}</label>
              <input
                type="number"
                min="0"
                value={filters.minInstalls}
                onChange={(e) => setFilters({ ...filters, minInstalls: parseInt(e.target.value) || 0 })}
                className="ep-filter-input"
                placeholder="0"
              />
            </div>

            <div className="ep-filter-group">
              <label className="ep-filter-label">{t('Trier par')}</label>
              <select
                value={filters.sortBy}
                onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
                className="ep-filter-select"
              >
                <option value="trending">{t('Tendance')}</option>
                <option value="installs">{t('Installations')}</option>
                <option value="stars">{t('Étoiles')}</option>
                <option value="recent">{t('Récent')}</option>
                <option value="rating">{t('Évaluation')}</option>
              </select>
            </div>

            <button
              onClick={handleApplyFilters}
              className="ep-btn-primary"
              style={{ whiteSpace: 'nowrap' }}
            >
              {t('Appliquer')}
            </button>
          </div>
        </div>
      )}

      <div className="ep-body">
        {viewMode === 'marketplace' ? (
          <>
            <div className="ep-page-header">
              <h1 className="ep-page-title">{t("Marketplace des compétences")}</h1>
              <p className="ep-page-subtitle">
                {t("Découvrez et installez des compétences pour donner des superpouvoirs à votre agent.")}
              </p>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-[#978a80]" />
                <p className="text-sm text-[#8a7f78]">{t("Chargement du marketplace...")}</p>
              </div>
            ) : showFilteredView ? (
              <section className="ep-section">
                <div className="ep-section-label-row">
                  <span className="ep-section-label">{t('Résultats filtrés')} ({filteredResults.length})</span>
                  <button
                    onClick={() => setShowFilteredView(false)}
                    className="ep-btn-ghost-sm"
                  >
                    <X className="h-3.5 w-3.5" />
                    {t('Réinitialiser')}
                  </button>
                </div>
                <div className="ep-marketplace-grid">
                  {filteredResults.map((skill) => (
                    <SkillMarketplaceCard
                      key={skill.source}
                      skill={skill}
                      isInstalled={installedSources.has(skill.source)}
                      isBusy={busySkill === skill.source}
                      onInstall={() => void installExternalSkill(skill)}
                      onPreview={() => setPreviewSkill(skill)}
                      rating={skillRatings[skill.source]}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <>
                {marketplace?.featured && marketplace.featured.length > 0 && (
                  <section className="ep-section">
                    <div className="ep-marketplace-section-header">
                      <div>
                        <div className="ep-section-eyebrow">{t("SÉLECTION")}</div>
                        <h2 className="ep-marketplace-section-title">{t("Recommandées")}</h2>
                      </div>
                    </div>
                    <div className="ep-marketplace-featured-grid">
                      {marketplace.featured.map((skill) => (
                        <SkillMarketplaceCard
                          key={skill.source}
                          skill={skill}
                          isInstalled={installedSources.has(skill.source)}
                          isBusy={busySkill === skill.source}
                          onInstall={() => void installExternalSkill(skill)}
                          onPreview={() => setPreviewSkill(skill)}
                          featured
                          rating={skillRatings[skill.source]}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {marketplace?.new && marketplace.new.length > 0 && (
                  <section className="ep-section">
                    <div className="ep-marketplace-section-header">
                      <div>
                        <div className="ep-section-eyebrow">{t("NOUVELLES")}</div>
                        <h2 className="ep-marketplace-section-title">{t("Récemment ajoutées")}</h2>
                      </div>
                    </div>
                    <div className="ep-marketplace-grid">
                      {marketplace.new.map((skill) => (
                        <SkillMarketplaceCard
                          key={skill.source}
                          skill={skill}
                          isInstalled={installedSources.has(skill.source)}
                          isBusy={busySkill === skill.source}
                          onInstall={() => void installExternalSkill(skill)}
                          onPreview={() => setPreviewSkill(skill)}
                          rating={skillRatings[skill.source]}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {marketplace?.trending && marketplace.trending.length > 0 && (
                  <section className="ep-section">
                    <div className="ep-marketplace-section-header">
                      <div>
                        <div className="ep-section-eyebrow">{t("POPULAIRES")}</div>
                        <h2 className="ep-marketplace-section-title">{t("Les plus utiles")}</h2>
                      </div>
                    </div>
                    <div className="ep-marketplace-grid">
                      {marketplace.trending.map((skill) => (
                        <SkillMarketplaceCard
                          key={skill.source}
                          skill={skill}
                          isInstalled={installedSources.has(skill.source)}
                          isBusy={busySkill === skill.source}
                          onInstall={() => void installExternalSkill(skill)}
                          onPreview={() => setPreviewSkill(skill)}
                          rating={skillRatings[skill.source]}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {marketplace?.byCategory && marketplace.byCategory.length > 0 && (
                  <>
                    {marketplace.byCategory.map((category) => (
                      <section key={category.name} className="ep-section">
                        <div className="ep-marketplace-section-header">
                          <div>
                            <div className="ep-section-eyebrow">{t("CATÉGORIE")}</div>
                            <h2 className="ep-marketplace-section-title">
                              {category.name} <span className="ep-category-count">{category.count}</span>
                            </h2>
                          </div>
                        </div>
                        <div className="ep-marketplace-grid">
                          {category.items.map((skill) => (
                            <SkillMarketplaceCard
                              key={skill.source}
                              skill={skill}
                              isInstalled={installedSources.has(skill.source)}
                              isBusy={busySkill === skill.source}
                              onInstall={() => void installExternalSkill(skill)}
                              onPreview={() => setPreviewSkill(skill)}
                              rating={skillRatings[skill.source]}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div className="ep-page-header">
              <h1 className="ep-page-title">{t("Compétences")}</h1>
              <p className="ep-page-subtitle">
                {t("Donnez des superpouvoirs à votre agent.")}
              </p>
            </div>

            {installedSkills.length > 0 && (
              <section className="ep-section">
                <div className="ep-section-label">{t("Installé")}</div>
                <div className="ep-card-grid">
                  {installedSkills.map((skill) => {
                    const pending = busySkill === skill.source;
                    const title = formatSkillTitle(skill.source);
                    return (
                      <div key={skill.source} className="ep-card-row">
                        <div className="ep-card-icon ep-card-icon-initials">
                          <span>{getSkillInitials(title)}</span>
                        </div>
                        <div className="ep-card-body">
                          <div className="ep-card-name">{title}</div>
                          <div className="ep-card-desc">
                            {getSkillDescription(skill.source)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`ep-toggle ep-toggle-on${pending ? " ep-toggle-busy" : ""}`}
                          disabled={pending}
                          onClick={() => {
                            if (!pending) void toggleSkill(skill);
                          }}
                          aria-label={t("Désinstaller {{name}}", { name: title })}
                        >
                          <span className="ep-toggle-thumb" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {!loading &&
              installedSkills.length === 0 &&
              discoverSkills.length === 0 && (
                <div className="ep-empty">{t("Aucune compétence trouvée.")}</div>
              )}

            {discoverSkills.length > 0 && (
              <section className="ep-section">
                <div className="ep-section-label">{t("Catalogue")}</div>
                <div className="ep-card-grid">
                  {discoverSkills.map((skill) => {
                    const pending = busySkill === skill.source;
                    const title = skill.title || formatSkillTitle(skill.source);
                    return (
                      <div key={skill.source} className="ep-card-row">
                        <div className="ep-card-icon ep-card-icon-initials ep-card-icon-dim">
                          <span>{getSkillInitials(title)}</span>
                        </div>
                        <div className="ep-card-body">
                          <div className="ep-card-name">{title}</div>
                          <div className="ep-card-desc">
                            {skill.description || getSkillDescription(skill.source)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`ep-toggle${pending ? " ep-toggle-busy" : ""}`}
                          disabled={pending}
                          onClick={() => {
                            if (!pending) void installExternalSkill(skill);
                          }}
                          aria-label={t("Installer {{name}}", { name: title })}
                        >
                          <span className="ep-toggle-thumb" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Skill Preview Modal */}
      {previewSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="ep-skill-preview">
            <div className="ep-skill-preview-header">
              <h3 className="ep-skill-preview-title">{previewSkill.title}</h3>
              <button onClick={() => setPreviewSkill(null)} className="ep-btn-cancel">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="ep-skill-preview-body">
              <p className="ep-skill-preview-desc">{previewSkill.description}</p>

              {previewSkill.documentation && (
                <div className="ep-skill-preview-section">
                  <h4 className="ep-skill-preview-subtitle">{t('Documentation')}</h4>
                  <a href={previewSkill.documentation} target="_blank" rel="noopener noreferrer" className="ep-skill-preview-link">
                    <ExternalLink className="h-3 w-3" />
                    {t('Voir la documentation')}
                  </a>
                </div>
              )}

              {previewSkill.repository && (
                <div className="ep-skill-preview-section">
                  <h4 className="ep-skill-preview-subtitle">{t('Dépôt')}</h4>
                  <a href={previewSkill.repository} target="_blank" rel="noopener noreferrer" className="ep-skill-preview-link">
                    <GitBranch className="h-3 w-3" />
                    {t('Voir le code')}
                  </a>
                </div>
              )}

              {previewSkill.dependencies && previewSkill.dependencies.length > 0 && (
                <div className="ep-skill-preview-section">
                  <h4 className="ep-skill-preview-subtitle">{t('Dépendances')}</h4>
                  <div className="ep-dependencies-list">
                    {previewSkill.dependencies.map(dep => (
                      <span key={dep} className="ep-dependency-tag">{dep}</span>
                    ))}
                  </div>
                </div>
              )}

              {previewSkill.category && (
                <div className="ep-skill-preview-section">
                  <h4 className="ep-skill-preview-subtitle">{t('Catégorie')}</h4>
                  <p>{previewSkill.category}</p>
                </div>
              )}

              {previewSkill.language && (
                <div className="ep-skill-preview-section">
                  <h4 className="ep-skill-preview-subtitle">{t('Langage')}</h4>
                  <p>{previewSkill.language}</p>
                </div>
              )}

              {(previewSkill.installs || previewSkill.stars) && (
                <div className="ep-skill-preview-section">
                  <h4 className="ep-skill-preview-subtitle">{t('Statistiques')}</h4>
                  <div className="ep-skill-stats">
                    {previewSkill.installs && <span>{previewSkill.installs} {t('installations')}</span>}
                    {previewSkill.stars && <span>{previewSkill.stars} ⭐</span>}
                  </div>
                </div>
              )}

              {skillRatings[previewSkill.source] && (
                <div className="ep-skill-preview-section">
                  <h4 className="ep-skill-preview-subtitle">{t('Évaluation')}</h4>
                  <div className="ep-skill-rating-display">
                    <div className="ep-skill-rating-stars">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={i < Math.round(skillRatings[previewSkill.source]?.average || 0) ? '⭐' : '☆'} />
                      ))}
                    </div>
                    <span className="ep-skill-rating-text">
                      {skillRatings[previewSkill.source]?.average.toFixed(1)}/5 ({skillRatings[previewSkill.source]?.count} {t('avis')})
                    </span>
                  </div>

                  <div className="ep-skill-rating-form">
                    <div className="ep-rating-stars">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setUserRating(prev => ({ ...prev, [previewSkill.source]: i + 1 }))}
                          className={`ep-rating-star${userRating[previewSkill.source] === i + 1 ? ' ep-rating-star-active' : ''}`}
                        >
                          {i < (userRating[previewSkill.source] || 0) ? '★' : '☆'}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={ratingReview}
                      onChange={(e) => setRatingReview(e.target.value)}
                      placeholder={t('Votre avis (optionnel)')}
                      className="ep-rating-review"
                      rows={3}
                    />
                    <button
                      onClick={() => handleAddRating(previewSkill.source, userRating[previewSkill.source] || 0)}
                      disabled={!userRating[previewSkill.source]}
                      className="ep-btn-primary"
                    >
                      {t('Évaluer')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SkillMarketplaceCardProps {
  skill: ExternalSkill;
  isInstalled: boolean;
  isBusy: boolean;
  onInstall: () => void;
  onPreview: () => void;
  featured?: boolean;
  rating?: { average: number; count: number };
}

function SkillMarketplaceCard({ skill, isInstalled, isBusy, onInstall, onPreview, featured, rating }: SkillMarketplaceCardProps) {
  const { t } = useTranslation();
  const title = skill.title || formatSkillTitle(skill.source);

  return (
    <div className={`ep-marketplace-card${featured ? ' ep-marketplace-card-featured' : ''}`}>
      <div className="ep-marketplace-card-header">
        <div className="ep-marketplace-card-icon">
          <span>{getSkillInitials(title)}</span>
        </div>
        <div className="ep-marketplace-card-badges">
          {skill.popularity === 'new' && (
            <span className="ep-marketplace-badge-new">{t('Nouveau')}</span>
          )}
          {skill.popularity === 'trending' && (
            <span className="ep-marketplace-badge-trending">
              <TrendingUp className="h-3 w-3" />
              {t('Tendance')}
            </span>
          )}
          {skill.popularity === 'popular' && (
            <span className="ep-marketplace-badge-popular">
              <Star className="h-3 w-3" />
              {t('Populaire')}
            </span>
          )}
          {skill.highlighted && (
            <span className="ep-marketplace-badge-builtin">{t('Recommandée')}</span>
          )}
        </div>
      </div>

      <h3 className="ep-marketplace-card-title">{title}</h3>

      {skill.category && (
        <div className="ep-marketplace-card-category">{skill.category}</div>
      )}

      <p className="ep-marketplace-card-description">{skill.description || getSkillDescription(skill.source)}</p>

      {skill.tags && skill.tags.length > 0 && (
        <div className="ep-marketplace-card-tags">
          {skill.tags.map(tag => (
            <span key={tag} className="ep-marketplace-tag">{tag}</span>
          ))}
        </div>
      )}

      {/* Rating Display */}
      {rating && (
        <div className="ep-skill-card-rating">
          <div className="ep-skill-rating-stars">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < Math.round(rating.average) ? '⭐' : '☆'} />
            ))}
          </div>
          <span className="ep-skill-rating-count">({rating.count})</span>
        </div>
      )}

      <div className="ep-marketplace-card-footer">
        <div className="ep-marketplace-card-meta">
          {skill.author && (
            <div className="ep-marketplace-card-author">{t('par')} {skill.author}</div>
          )}
          {skill.language && (
            <div className="ep-marketplace-card-language">{skill.language}</div>
          )}
          {(skill.installs || skill.stars) && (
            <div className="ep-marketplace-card-stats">
              {skill.installs && <span>{skill.installs} {t('inst.')}</span>}
              {skill.stars && <span>{skill.stars} ★</span>}
            </div>
          )}
        </div>

        <div className="ep-marketplace-card-actions">
          <button
            type="button"
            onClick={onPreview}
            className="ep-btn-ghost-sm"
            title={t('Aperçu')}
          >
            {t('Aperçu')}
          </button>
          <button
            type="button"
            className="ep-marketplace-install-btn"
            disabled={isBusy || isInstalled}
            onClick={onInstall}
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isInstalled ? (
              t('Installée')
            ) : (
              t('Installer')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
