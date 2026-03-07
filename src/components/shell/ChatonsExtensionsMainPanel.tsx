import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  Square,
  Zap,
} from "lucide-react";

import { getExtensionIcon } from "@/components/extensions/extension-icons";
import { useTranslation } from "react-i18next";

import type {
  ChatonsExtension,
  ChatonsExtensionCatalogItem,
} from "@/features/workspace/types";
import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";

type ViewMode = "installed" | "marketplace";

export function ChatonsExtensionsMainPanel() {
  const { t } = useTranslation();
  const { setNotice } = useWorkspace();
  const [viewMode, setViewMode] = useState<ViewMode>("marketplace");
  const [extensions, setExtensions] = useState<ChatonsExtension[]>([]);
  const [catalog, setCatalog] = useState<ChatonsExtensionCatalogItem[]>([]);
  const [marketplace, setMarketplace] = useState<{
    featured?: ChatonsExtensionCatalogItem[];
    new?: ChatonsExtensionCatalogItem[];
    trending?: ChatonsExtensionCatalogItem[];
    byCategory?: Array<{
      name: string;
      count: number;
      items: ChatonsExtensionCatalogItem[];
    }>;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [logsById, setLogsById] = useState<Record<string, string>>({});
  const [updatesAvailable, setUpdatesAvailable] = useState<
    Array<{ id: string; currentVersion: string; latestVersion: string }>
  >([]);
  const installPollRef = useRef<number | null>(null);
  const updatePollRef = useRef<number | null>(null);
  const [serverStatusById, setServerStatusById] = useState<
    Record<string, { ready?: boolean; lastError?: string } | null>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [installedResult, catalogResult, updatesResult, marketplaceResult] =
        await Promise.all([
          workspaceIpc.listExtensions(),
          workspaceIpc.listExtensionCatalog(),
          workspaceIpc.checkExtensionUpdates(),
          workspaceIpc.getExtensionMarketplace(),
        ]);
      setExtensions(installedResult.extensions ?? []);
      setCatalog(catalogResult.entries ?? []);
      setUpdatesAvailable(updatesResult.updates ?? []);
      if (marketplaceResult.ok) {
        setMarketplace({
          featured: marketplaceResult.featured,
          new: marketplaceResult.new,
          trending: marketplaceResult.trending,
          byCategory: marketplaceResult.byCategory,
        });
      }
      const uiResult = await workspaceIpc.registerExtensionUi();
      const nextStatus: Record<
        string,
        { ready?: boolean; lastError?: string } | null
      > = {};
      for (const entry of (uiResult.entries ?? []) as Array<{
        extensionId: string;
        serverStatus?: { ready?: boolean; lastError?: string } | null;
      }>) {
        if (entry && typeof entry.extensionId === "string") {
          nextStatus[entry.extensionId] = entry.serverStatus ?? null;
        }
      }
      setServerStatusById(nextStatus);
    } catch (error) {
      console.error("Failed to load extensions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (installPollRef.current !== null) {
        window.clearInterval(installPollRef.current);
      }
    };
  }, []);

  const handleToggle = async (item: ChatonsExtension) => {
    setBusyId(item.id);
    const result = await workspaceIpc.toggleExtension(item.id, !item.enabled);
    if (!result.ok) {
      setNotice(
        result.message ?? t("Impossible de changer le statut de l'extension."),
      );
      setBusyId(null);
      return;
    }
    await load();
    setBusyId(null);
  };

  const handleShowLogs = async (item: ChatonsExtension) => {
    const result = await workspaceIpc.getExtensionLogs(item.id);
    setLogsById((prev) => ({ ...prev, [item.id]: result.content ?? "" }));
  };

  const handleRemove = async (item: ChatonsExtension) => {
    setBusyId(item.id);
    const result = await workspaceIpc.removeExtension(item.id);
    if (!result.ok) {
      setNotice(
        result.message ?? t("Impossible de supprimer cette extension."),
      );
      setBusyId(null);
      return;
    }
    await load();
    setBusyId(null);
  };

  const stopInstallPolling = useCallback(() => {
    if (installPollRef.current !== null) {
      window.clearInterval(installPollRef.current);
      installPollRef.current = null;
    }
  }, []);

  const stopUpdatePolling = useCallback(() => {
    if (updatePollRef.current !== null) {
      window.clearInterval(updatePollRef.current);
      updatePollRef.current = null;
    }
  }, []);

  const beginInstallPolling = useCallback(
    (id: string, name: string) => {
      stopInstallPolling();
      setInstallingId(id);
      installPollRef.current = window.setInterval(async () => {
        const stateResult = await workspaceIpc.getExtensionInstallState(id);
        const state = stateResult.state;
        if (!state) return;
        setInstallMessage(state.message ?? null);
        if (state.status === "running") return;
        stopInstallPolling();
        setInstallingId(null);
        setBusyId(null);
        await load();
        if (state.status === "done") {
          setNotice(t("{{name}} installée.", { name }));
          return;
        }
        if (state.status === "cancelled") {
          setNotice(t("Installation annulée."));
          return;
        }
        if (state.status === "error") {
          setNotice(state.message ?? t("Installation impossible."));
        }
      }, 700);
    },
    [load, setNotice, stopInstallPolling, t],
  );

  const beginUpdatePolling = useCallback(
    (id: string, name: string) => {
      stopUpdatePolling();
      updatePollRef.current = window.setInterval(async () => {
        const stateResult = await workspaceIpc.getExtensionInstallState(id);
        const state = stateResult.state;
        if (!state) return;
        if (state.status === "running") return;
        stopUpdatePolling();
        setBusyId(null);
        await load();
        if (state.status === "done") {
          setNotice(t("{{name}} mise à jour.", { name }));
          return;
        }
        if (state.status === "cancelled") {
          setNotice(t("Mise à jour annulée."));
          return;
        }
        if (state.status === "error") {
          setNotice(state.message ?? t("Mise à jour impossible."));
        }
      }, 700);
    },
    [load, setNotice, stopUpdatePolling, t],
  );

  const handleCancelInstall = async (id: string) => {
    const result = await workspaceIpc.cancelExtensionInstall(id);
    if (!result.ok) {
      setNotice(result.message ?? t("Impossible d'annuler l'installation."));
      return;
    }
    setInstallMessage(t("Installation annulée."));
  };

  const handleInstall = async (item: ChatonsExtensionCatalogItem) => {
    setBusyId(item.id);
    setInstallMessage(t("Installation en cours..."));
    const result = await workspaceIpc.installExtension(item.id);
    if (!result.ok) {
      setNotice(result.message ?? t("Installation impossible."));
      setBusyId(null);
      setInstallMessage(null);
      return;
    }
    if (result.started) {
      beginInstallPolling(item.id, item.name);
      return;
    }
    setNotice(t("{{name}} installée.", { name: item.name }));
    await load();
    setBusyId(null);
    setInstallMessage(null);
  };

  const handleUpdate = async (item: ChatonsExtension) => {
    setBusyId(item.id);
    const result = await workspaceIpc.updateExtension(item.id);
    if (!result.ok) {
      setNotice(result.message ?? t("Mise à jour impossible."));
      setBusyId(null);
      return;
    }
    if (result.started) {
      beginUpdatePolling(item.id, item.name);
      return;
    }
    setNotice(t("{{name}} mise à jour.", { name: item.name }));
    await load();
    setBusyId(null);
  };

  const handleUpdateAll = async () => {
    const extensionsToUpdate = updatesAvailable.map((update) => update.id);
    if (extensionsToUpdate.length === 0) {
      setNotice(t("Aucune mise à jour disponible."));
      return;
    }

    setBusyId("all");
    setUpdateMessage(t("Mise à jour de toutes les extensions..."));
    const result = await workspaceIpc.updateAllExtensions();

    if (result.ok) {
      const successCount = result.results.filter((r) => r.success).length;
      setNotice(
        t("{{count}} extensions mises à jour.", { count: successCount }),
      );
      await load();
    } else {
      setNotice(t("Échec de la mise à jour des extensions."));
    }

    setBusyId(null);
    setUpdateMessage(null);
  };

  const handleRestart = async () => {
    await workspaceIpc.restartAppForExtension();
  };

  const [showNpmLoginModal, setShowNpmLoginModal] = useState<{
    extensionId: string;
    extensionName: string;
  } | null>(null);
  const [npmToken, setNpmToken] = useState("");

  const handlePublish = async (item: ChatonsExtension) => {
    setBusyId(item.id);
    const result = await workspaceIpc.publishExtension(item.id);
    if (!result.ok) {
      if (result.requiresNpmLogin) {
        setShowNpmLoginModal({
          extensionId: item.id,
          extensionName: item.name,
        });
        setBusyId(null);
        return;
      }
      setNotice(result.message ?? t("Impossible de publier cette extension."));
      setBusyId(null);
      return;
    }
    if (result.started) {
      setNotice(t("Publication de {{name}} en cours...", { name: item.name }));
      return;
    }
    setNotice(t("{{name}} publiée.", { name: item.name }));
    await load();
    setBusyId(null);
  };

  const handlePublishWithToken = async () => {
    if (!showNpmLoginModal) return;

    setBusyId(showNpmLoginModal.extensionId);
    setShowNpmLoginModal(null);

    const result = await workspaceIpc.publishExtension(
      showNpmLoginModal.extensionId,
      npmToken,
    );
    if (!result.ok) {
      setNotice(result.message ?? t("Impossible de publier cette extension."));
      setBusyId(null);
      return;
    }
    if (result.started) {
      setNotice(
        t("Publication de {{name}} en cours...", {
          name: showNpmLoginModal.extensionName,
        }),
      );
      setNpmToken("");
      return;
    }
    setNotice(
      t("{{name}} publiée.", { name: showNpmLoginModal.extensionName }),
    );
    await load();
    setBusyId(null);
    setNpmToken("");
  };

  const installedIds = new Set(extensions.map((extension) => extension.id));
  const discoverItems = useMemo(() => {
    const base = catalog.filter((item) => !installedIds.has(item.id));
    const normalized = query.trim().toLowerCase();
    return base.filter((item) => {
      if (!normalized) return true;
      const haystack =
        `${item.name} ${item.id} ${item.description}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [catalog, installedIds, query]);
  const installedItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return extensions.filter((item) => {
      if (!normalized) return true;
      const haystack =
        `${item.name} ${item.id} ${item.description}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [extensions, query]);

  return (
    <>
      <div className="ep-page">
        <div className="ep-topbar">
          <div className="ep-topbar-actions">
            <div className="ep-mode-switcher">
              <button
                type="button"
                className={`ep-mode-btn${viewMode === "marketplace" ? " ep-mode-btn-active" : ""}`}
                onClick={() => setViewMode("marketplace")}
              >
                <Zap className="h-4 w-4" />
                <span>{t("Marketplace")}</span>
              </button>
              <button
                type="button"
                className={`ep-mode-btn${viewMode === "installed" ? " ep-mode-btn-active" : ""}`}
                onClick={() => setViewMode("installed")}
              >
                <span>
                  {t("Installées")}{" "}
                  {extensions.length > 0 && (
                    <span className="ep-mode-badge">{extensions.length}</span>
                  )}
                </span>
              </button>
            </div>
            <button
              type="button"
              className="ep-btn-ghost"
              onClick={() => void load()}
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
                placeholder={t("Rechercher des extensions...")}
                className="ep-search-input"
              />
            </div>
            {viewMode === "installed" && (
              <button
                type="button"
                className="ep-btn-ghost"
                onClick={async () => {
                  const result = await workspaceIpc.openExtensionsFolder();
                  if (!result.ok)
                    setNotice(
                      result.message ??
                        t("Impossible d'ouvrir le dossier des extensions."),
                    );
                }}
                title={t("Ouvrir le dossier des extensions")}
              >
                <FolderOpen className="h-4 w-4" />
                <span>{t("Ouvrir le dossier")}</span>
              </button>
            )}
          </div>
        </div>

        <div className="ep-body">
          {viewMode === "marketplace" ? (
            <>
              <div className="ep-page-header">
                <h1 className="ep-page-title">
                  {t("Marketplace des extensions")}
                </h1>
                <p className="ep-page-subtitle">
                  {t(
                    "Découvrez et installez des extensions pour étendre vos capacités.",
                  )}
                </p>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-[#978a80]" />
                  <p className="text-sm text-[#8a7f78]">
                    {t("Chargement du marketplace...")}
                  </p>
                </div>
              ) : (
                <>
                  {/* Featured Section */}
                  {marketplace?.featured && marketplace.featured.length > 0 && (
                    <section className="ep-section">
                      <div className="ep-marketplace-section-header">
                        <div>
                          <div className="ep-section-eyebrow">
                            {t("SÉLECTION")}
                          </div>
                          <h2 className="ep-marketplace-section-title">
                            {t("Recommandées")}
                          </h2>
                        </div>
                      </div>
                      <div className="ep-marketplace-featured-grid">
                        {marketplace.featured.map((item) => (
                          <MarketplaceExtensionCard
                            key={item.id}
                            item={item}
                            isInstalled={installedIds.has(item.id)}
                            isInstalling={installingId === item.id}
                            isBusy={busyId === item.id}
                            onInstall={() => void handleInstall(item)}
                            featured
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* New Section */}
                  {marketplace?.new && marketplace.new.length > 0 && (
                    <section className="ep-section">
                      <div className="ep-marketplace-section-header">
                        <div>
                          <div className="ep-section-eyebrow">
                            {t("NOUVELLES")}
                          </div>
                          <h2 className="ep-marketplace-section-title">
                            {t("Récemment ajoutées")}
                          </h2>
                        </div>
                      </div>
                      <div className="ep-marketplace-grid">
                        {marketplace.new.map((item) => (
                          <MarketplaceExtensionCard
                            key={item.id}
                            item={item}
                            isInstalled={installedIds.has(item.id)}
                            isInstalling={installingId === item.id}
                            isBusy={busyId === item.id}
                            onInstall={() => void handleInstall(item)}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Trending Section */}
                  {marketplace?.trending && marketplace.trending.length > 0 && (
                    <section className="ep-section">
                      <div className="ep-marketplace-section-header">
                        <div>
                          <div className="ep-section-eyebrow">
                            {t("POPULAIRES")}
                          </div>
                          <h2 className="ep-marketplace-section-title">
                            {t("Les plus utiles")}
                          </h2>
                        </div>
                      </div>
                      <div className="ep-marketplace-grid">
                        {marketplace.trending.map((item) => (
                          <MarketplaceExtensionCard
                            key={item.id}
                            item={item}
                            isInstalled={installedIds.has(item.id)}
                            isInstalling={installingId === item.id}
                            isBusy={busyId === item.id}
                            onInstall={() => void handleInstall(item)}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Categories */}
                  {marketplace?.byCategory &&
                    marketplace.byCategory.length > 0 && (
                      <>
                        {marketplace.byCategory.map((category) => (
                          <section key={category.name} className="ep-section">
                            <div className="ep-marketplace-section-header">
                              <div>
                                <div className="ep-section-eyebrow">
                                  {t("CATÉGORIE")}
                                </div>
                                <h2 className="ep-marketplace-section-title">
                                  {category.name}{" "}
                                  <span className="ep-category-count">
                                    {category.count}
                                  </span>
                                </h2>
                              </div>
                            </div>
                            <div className="ep-marketplace-grid">
                              {category.items.map((item) => (
                                <MarketplaceExtensionCard
                                  key={item.id}
                                  item={item}
                                  isInstalled={installedIds.has(item.id)}
                                  isInstalling={installingId === item.id}
                                  isBusy={busyId === item.id}
                                  onInstall={() => void handleInstall(item)}
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
                <h1 className="ep-page-title">{t("Extensions")}</h1>
                <p className="ep-page-subtitle">
                  {t("Étendez les capacités de votre workspace.")}
                </p>
              </div>

              {installingId ? (
                <div
                  className="ep-progress-bar"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{installMessage ?? t("Installation en cours...")}</span>
                  <button
                    type="button"
                    className="ep-btn-cancel ml-auto"
                    onClick={() => void handleCancelInstall(installingId)}
                    aria-label={t("Annuler l'installation")}
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
              {updateMessage ? (
                <div
                  className="ep-progress-bar"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{updateMessage}</span>
                </div>
              ) : null}

              {updatesAvailable.length > 0 && (
                <section className="ep-section">
                  <div className="ep-section-label-row">
                    <span className="ep-section-label">
                      {t("Mises à jour disponibles")}
                    </span>
                    <button
                      type="button"
                      className="ep-btn-primary"
                      onClick={() => void handleUpdateAll()}
                      disabled={busyId === "all"}
                    >
                      {t("Tout mettre à jour")}
                    </button>
                  </div>
                  <div className="ep-card-grid">
                    {updatesAvailable.map((update) => {
                      const extension = extensions.find(
                        (ext) => ext.id === update.id,
                      );
                      if (!extension) return null;
                      const pending =
                        busyId === extension.id || busyId === "all";
                      const iconValue = getExtensionIcon(
                        typeof extension.config?.iconUrl === "string"
                          ? extension.config.iconUrl
                          : extension.config?.icon,
                      );
                      return (
                        <div key={extension.id} className="ep-card-row">
                          <div className="ep-card-icon">
                            {iconValue.kind === "image" ? (
                              <img
                                src={iconValue.src}
                                alt=""
                                className="h-6 w-6 object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <iconValue.Component className="h-5 w-5" />
                            )}
                          </div>
                          <div className="ep-card-body">
                            <div className="ep-card-name">
                              {extension.name}
                              <span className="ep-badge-update">
                                {update.currentVersion} → {update.latestVersion}
                              </span>
                            </div>
                            <div className="ep-card-desc">
                              {extension.description}
                            </div>
                            {logsById[extension.id] ? (
                              <pre className="ep-log-box">
                                {logsById[extension.id]}
                              </pre>
                            ) : null}
                          </div>
                          <div className="ep-card-actions">
                            <button
                              type="button"
                              className="ep-btn-primary"
                              disabled={pending}
                              onClick={() => void handleUpdate(extension)}
                            >
                              {pending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                t("Mettre à jour")
                              )}
                            </button>
                            <button
                              type="button"
                              className="ep-btn-ghost-sm"
                              onClick={() => void handleShowLogs(extension)}
                              title={t("Voir logs")}
                            >
                              {t("Logs")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {installedItems.length > 0 && (
                <section className="ep-section">
                  <div className="ep-section-label">{t("Installé")}</div>
                  <div className="ep-card-grid">
                    {installedItems.map((extension) => {
                      const pending = busyId === extension.id;
                      const requiresRestart =
                        extension.config?.requiresRestart === true;
                      const serverStatus =
                        serverStatusById[extension.id] ?? null;
                      const iconValue = getExtensionIcon(
                        typeof extension.config?.iconUrl === "string"
                          ? extension.config.iconUrl
                          : extension.config?.icon,
                      );
                      const hasUpdate = updatesAvailable.some(
                        (u) => u.id === extension.id,
                      );
                      return (
                        <div key={extension.id} className="ep-card-row">
                          <div className="ep-card-icon">
                            {iconValue.kind === "image" ? (
                              <img
                                src={iconValue.src}
                                alt=""
                                className="h-6 w-6 object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <iconValue.Component className="h-5 w-5" />
                            )}
                          </div>
                          <div className="ep-card-body">
                            <div className="ep-card-name">
                              {extension.name}
                              {hasUpdate && (
                                <span className="ep-badge-update">
                                  {t("Mise à jour")}
                                </span>
                              )}
                              {requiresRestart && (
                                <span className="ep-badge-warn">
                                  {t("Restart")}
                                </span>
                              )}
                            </div>
                            <div className="ep-card-desc">
                              {extension.description}
                            </div>
                            {extension.lastError && (
                              <div className="ep-card-error">
                                {extension.lastError}
                              </div>
                            )}
                            {serverStatus && serverStatus.ready === false && (
                              <div className="ep-card-error">
                                {t("Serveur en cours de démarrage...")}
                              </div>
                            )}
                            {logsById[extension.id] ? (
                              <pre className="ep-log-box">
                                {logsById[extension.id]}
                              </pre>
                            ) : null}
                          </div>
                          <div className="ep-card-actions">
                            <button
                              type="button"
                              className={`ep-toggle${extension.enabled ? " ep-toggle-on" : ""}${pending ? " ep-toggle-busy" : ""}`}
                              disabled={pending}
                              onClick={() => {
                                if (!pending) void handleToggle(extension);
                              }}
                              aria-label={
                                extension.enabled
                                  ? t("Désactiver")
                                  : t("Activer")
                              }
                            >
                              <span className="ep-toggle-thumb" />
                            </button>
                            <button
                              type="button"
                              className="ep-btn-ghost-sm"
                              disabled={pending}
                              onClick={() => void handleShowLogs(extension)}
                              title={t("Voir logs")}
                            >
                              {t("Logs")}
                            </button>
                            {extension.installSource === "localPath" && (
                              <button
                                type="button"
                                className="ep-btn-ghost-sm"
                                disabled={pending}
                                onClick={() => void handlePublish(extension)}
                              >
                                {t("Publier")}
                              </button>
                            )}
                            {requiresRestart && (
                              <button
                                type="button"
                                className="ep-btn-primary"
                                onClick={() => void handleRestart()}
                              >
                                {t("Relancer")}
                              </button>
                            )}
                            {extension.installSource !== "builtin" && (
                              <button
                                type="button"
                                className="ep-btn-danger-sm"
                                disabled={pending}
                                onClick={() => void handleRemove(extension)}
                                title={t("Supprimer")}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {!loading && installedItems.length === 0 && (
                <div className="ep-empty">
                  {t("Aucune extension installée.")}
                </div>
              )}

              {discoverItems.length > 0 && (
                <section className="ep-section">
                  <div className="ep-section-label">{t("Catalogue")}</div>
                  <div className="ep-card-grid">
                    {discoverItems.map((item) => {
                      const pending = busyId === item.id;
                      const isInstalling = installingId === item.id;
                      const iconValue = getExtensionIcon(
                        typeof (item as { iconUrl?: string }).iconUrl ===
                          "string"
                          ? (item as { iconUrl?: string }).iconUrl
                          : undefined,
                      );
                      return (
                        <div key={item.id} className="ep-card-row">
                          <div className="ep-card-icon ep-card-icon-dim">
                            {iconValue.kind === "image" ? (
                              <img
                                src={iconValue.src}
                                alt=""
                                className="h-6 w-6 object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <iconValue.Component className="h-5 w-5" />
                            )}
                          </div>
                          <div className="ep-card-body">
                            <div className="ep-card-name">{item.name}</div>
                            <div className="ep-card-desc">
                              {item.description}
                            </div>
                          </div>
                          <div className="ep-card-actions">
                            <button
                              type="button"
                              className="ep-btn-primary"
                              disabled={pending || installedIds.has(item.id)}
                              onClick={() => void handleInstall(item)}
                            >
                              {isInstalling ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : installedIds.has(item.id) ? (
                                t("Installée")
                              ) : (
                                t("Installer")
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {showNpmLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="ep-modal">
            <h3 className="ep-modal-title">{t("Connexion npm requise")}</h3>
            <p className="ep-modal-body">
              {t("Un token npm est nécessaire pour publier cette extension.")}
            </p>
            <div className="ep-modal-field">
              <label htmlFor="npmToken" className="ep-modal-label">
                {t("Token npm")}
              </label>
              <input
                type="password"
                id="npmToken"
                value={npmToken}
                onChange={(e) => setNpmToken(e.target.value)}
                className="ep-modal-input"
                placeholder={t("Entrez votre token npm")}
              />
            </div>
            <div className="ep-modal-actions">
              <button
                type="button"
                className="ep-btn-ghost"
                onClick={() => {
                  setShowNpmLoginModal(null);
                  setNpmToken("");
                  setBusyId(null);
                }}
              >
                {t("Annuler")}
              </button>
              <button
                type="button"
                className="ep-btn-primary"
                disabled={!npmToken.trim()}
                onClick={handlePublishWithToken}
              >
                {t("Publier")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface MarketplaceExtensionCardProps {
  item: ChatonsExtensionCatalogItem;
  isInstalled: boolean;
  isInstalling: boolean;
  isBusy: boolean;
  onInstall: () => void;
  featured?: boolean;
}

function MarketplaceExtensionCard({
  item,
  isInstalled,
  isInstalling,
  isBusy,
  onInstall,
  featured,
}: MarketplaceExtensionCardProps) {
  const { t } = useTranslation();
  const iconValue = getExtensionIcon(
    typeof (item as { iconUrl?: string }).iconUrl === "string"
      ? (item as { iconUrl?: string }).iconUrl
      : undefined,
  );

  return (
    <div
      className={`ep-marketplace-card${featured ? " ep-marketplace-card-featured" : ""}`}
    >
      <div className="ep-marketplace-card-header">
        <div className="ep-marketplace-card-icon">
          {iconValue.kind === "image" ? (
            <img
              src={iconValue.src}
              alt=""
              className="h-8 w-8 object-contain"
              loading="lazy"
            />
          ) : (
            <iconValue.Component className="h-6 w-6" />
          )}
        </div>
        <div className="ep-marketplace-card-badges">
          {item.popularity === "new" && (
            <span className="ep-marketplace-badge-new">{t("Nouveau")}</span>
          )}
          {item.popularity === "trending" && (
            <span className="ep-marketplace-badge-trending">
              <Zap className="h-3 w-3" />
              {t("Tendance")}
            </span>
          )}
          {item.popularity === "popular" && (
            <span className="ep-marketplace-badge-popular">
              ⭐ {t("Populaire")}
            </span>
          )}
          {item.source === "builtin" && (
            <span className="ep-marketplace-badge-builtin">{t("Intégré")}</span>
          )}
        </div>
      </div>

      <h3 className="ep-marketplace-card-title">{item.name}</h3>

      {item.category && (
        <div className="ep-marketplace-card-category">{item.category}</div>
      )}

      <p className="ep-marketplace-card-description">{item.description}</p>

      {item.tags && item.tags.length > 0 && (
        <div className="ep-marketplace-card-tags">
          {item.tags.map((tag) => (
            <span key={tag} className="ep-marketplace-tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="ep-marketplace-card-footer">
        <div className="ep-marketplace-card-meta">
          {item.author && (
            <div className="ep-marketplace-card-author">
              {t("par")} {item.author}
            </div>
          )}
          <div className="ep-marketplace-card-version">v{item.version}</div>
        </div>

        <button
          type="button"
          className="ep-marketplace-install-btn"
          disabled={isBusy || isInstalled}
          onClick={onInstall}
        >
          {isInstalling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isInstalled ? (
            t("Installée")
          ) : (
            t("Installer")
          )}
        </button>
      </div>
    </div>
  );
}
