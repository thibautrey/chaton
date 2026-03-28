import type {
  ChatonsExtension,
  ChatonsExtensionCatalogItem,
} from "@/features/workspace/types";
import {
  CheckCircle2,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  Square,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ExtensionIcon } from "@/components/extensions/extension-icons";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";

type ViewMode = "installed" | "marketplace" | "updates";

export function ChatonsExtensionsMainPanel() {
  const { t } = useTranslation();
  const { setNotice, state, clearDeeplinkExtensionId } = useWorkspace();
  const deeplinkExtensionId = state.deeplinkExtensionId;
  const [viewMode, setViewMode] = useState<ViewMode>("marketplace");
  const [extensions, setExtensions] = useState<ChatonsExtension[]>([]);
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
  const [completedInstallationId, setCompletedInstallationId] = useState<
    string | null
  >(null);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [logsById, setLogsById] = useState<Record<string, string>>({});
  const [activeLogsExtensionId, setActiveLogsExtensionId] = useState<
    string | null
  >(null);
  const [isLogsClosing, setIsLogsClosing] = useState(false);
  const [logsRendered, setLogsRendered] = useState(false);
  const [updatesAvailable, setUpdatesAvailable] = useState<
    Array<{ id: string; currentVersion: string; latestVersion: string }>
  >([]);
  const installPollRef = useRef<number | null>(null);
  const updatePollRef = useRef<number | null>(null);
  const featuredSectionRef = useRef<HTMLElement | null>(null);
  const newSectionRef = useRef<HTMLElement | null>(null);
  const trendingSectionRef = useRef<HTMLElement | null>(null);
  const [serverStatusById, setServerStatusById] = useState<
    Record<string, { ready?: boolean; lastError?: string } | null>
  >({});
  const [publishMessageById, setPublishMessageById] = useState<
    Record<string, string>
  >({});
  const [hasStoredNpmToken, setHasStoredNpmToken] = useState(false);
  const publishPollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        installedResult,
        updatesResult,
        marketplaceResult,
        tokenCheckResult,
      ] = await Promise.all([
        workspaceIpc.listExtensions(),
        workspaceIpc.checkExtensionUpdates(),
        workspaceIpc.getExtensionMarketplace(),
        workspaceIpc.checkStoredNpmToken(),
      ]);
      setExtensions(installedResult.extensions ?? []);
      setUpdatesAvailable(updatesResult.updates ?? []);
      setHasStoredNpmToken(tokenCheckResult.hasToken ?? false);
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
      if (publishPollRef.current !== null) {
        window.clearInterval(publishPollRef.current);
      }
    };
  }, []);

  // When a deep link targets a specific extension, switch to marketplace
  // and scroll to the matching card once the marketplace data has loaded.
  const deeplinkHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deeplinkExtensionId) return;
    if (deeplinkHandledRef.current === deeplinkExtensionId) return;

    setViewMode("marketplace");

    // Wait for marketplace data to be available before scrolling
    if (!marketplace) return;

    deeplinkHandledRef.current = deeplinkExtensionId;

    // Small delay to let the DOM render the cards
    const timer = setTimeout(() => {
      const card = document.querySelector(
        `[data-extension-id="${CSS.escape(deeplinkExtensionId)}"]`,
      );
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("ep-marketplace-card-highlight");
        setTimeout(
          () => card.classList.remove("ep-marketplace-card-highlight"),
          3000,
        );
      }
      clearDeeplinkExtensionId();
    }, 300);

    return () => clearTimeout(timer);
  }, [deeplinkExtensionId, marketplace, clearDeeplinkExtensionId]);

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
    if (activeLogsExtensionId === item.id) {
      // Close the logs sheet
      if (logsRendered) {
        setIsLogsClosing(true);
        setTimeout(() => {
          setLogsRendered(false);
          setIsLogsClosing(false);
          setActiveLogsExtensionId(null);
        }, 220);
      } else {
        setActiveLogsExtensionId(null);
      }
      return;
    }

    if (!logsById[item.id]) {
      const result = await workspaceIpc.getExtensionLogs(item.id);
      setLogsById((prev) => ({ ...prev, [item.id]: result.content ?? "" }));
    }

    // Open the logs sheet
    setLogsRendered(true);
    setActiveLogsExtensionId(item.id);
    setIsLogsClosing(false);
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

  const stopPublishPolling = useCallback(() => {
    if (publishPollRef.current !== null) {
      window.clearInterval(publishPollRef.current);
      publishPollRef.current = null;
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

        if (state.status === "done") {
          // Show checkmark and update installed extensions without full marketplace refresh.
          // We only fetch listExtensions() and checkExtensionUpdates(), not getExtensionMarketplace(),
          // so marketplace cards stay in place and don't visually refresh. The installedIds computed
          // value will automatically update to mark this extension as installed.
          setCompletedInstallationId(id);
          setTimeout(async () => {
            setCompletedInstallationId(null);
            setInstallMessage(null);
            // Only refresh installed extensions and updates, not marketplace
            const [installedResult, updatesResult] = await Promise.all([
              workspaceIpc.listExtensions(),
              workspaceIpc.checkExtensionUpdates(),
            ]);
            setExtensions(installedResult.extensions ?? []);
            setUpdatesAvailable(updatesResult.updates ?? []);
          }, 2000);
          setNotice(t("{{name}} installée.", { name }));
          return;
        }
        if (state.status === "cancelled") {
          setNotice(t("Installation annulée."));
          setInstallMessage(null);
          return;
        }
        if (state.status === "error") {
          setNotice(state.message ?? t("Installation impossible."));
          setInstallMessage(null);
        }
      }, 700);
    },
    [setNotice, stopInstallPolling, t],
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

  const beginPublishPolling = useCallback(
    (id: string, name: string) => {
      stopPublishPolling();
      publishPollRef.current = window.setInterval(async () => {
        const stateResult = await workspaceIpc.getExtensionInstallState(id);
        const state = stateResult.state;
        if (!state) return;
        if (state.status === "running") return;
        stopPublishPolling();
        setBusyId(null);
        setPublishMessageById((prev) => {
          const next = { ...prev };
          if (state.status === "done") {
            next[id] = t("{{name}} publiée.", { name });
          } else if (state.status === "error") {
            next[id] = state.message ?? t("Publication échouée.");
          }
          return next;
        });
        setTimeout(() => {
          setPublishMessageById((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }, 3000);
        await load();
      }, 700);
    },
    [load, stopPublishPolling, t],
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
        t("{{count}} extensions mises à jour.").replace(
          "{{count}}",
          successCount.toString(),
        ),
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
    setPublishMessageById((prev) => ({
      ...prev,
      [item.id]: t("Publication en cours..."),
    }));

    // Try with stored token first if available
    let result = await workspaceIpc.publishExtension(item.id);
    if (!result.ok && result.requiresNpmLogin && hasStoredNpmToken) {
      // Retry with stored token (pass empty string, backend will load it)
      result = await workspaceIpc.publishExtension(item.id, "");
    }

    if (!result.ok) {
      if (result.requiresNpmLogin) {
        setShowNpmLoginModal({
          extensionId: item.id,
          extensionName: item.name,
        });
        setPublishMessageById((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        setBusyId(null);
        return;
      }
      setPublishMessageById((prev) => ({
        ...prev,
        [item.id]:
          result.message ?? t("Impossible de publier cette extension."),
      }));
      setBusyId(null);
      return;
    }
    if (result.started) {
      setPublishMessageById((prev) => ({
        ...prev,
        [item.id]: t("Publication de {{name}} en cours...", {
          name: item.name,
        }),
      }));
      beginPublishPolling(item.id, item.name);
      return;
    }
    setPublishMessageById((prev) => ({
      ...prev,
      [item.id]: t("{{name}} publiée.", { name: item.name }),
    }));
    setTimeout(() => {
      setPublishMessageById((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }, 3000);
    await load();
    setBusyId(null);
  };

  const handlePublishWithToken = async () => {
    if (!showNpmLoginModal) return;

    setBusyId(showNpmLoginModal.extensionId);
    setPublishMessageById((prev) => ({
      ...prev,
      [showNpmLoginModal.extensionId]: t("Publication en cours..."),
    }));
    setShowNpmLoginModal(null);

    const result = await workspaceIpc.publishExtension(
      showNpmLoginModal.extensionId,
      npmToken,
    );
    if (!result.ok) {
      setPublishMessageById((prev) => ({
        ...prev,
        [showNpmLoginModal.extensionId]:
          result.message ?? t("Impossible de publier cette extension."),
      }));
      setBusyId(null);
      return;
    }
    if (result.started) {
      setPublishMessageById((prev) => ({
        ...prev,
        [showNpmLoginModal.extensionId]: t(
          "Publication de {{name}} en cours...",
          { name: showNpmLoginModal.extensionName },
        ),
      }));
      // Token was accepted, so it should be stored in the backend
      setHasStoredNpmToken(true);
      setNpmToken("");
      beginPublishPolling(
        showNpmLoginModal.extensionId,
        showNpmLoginModal.extensionName,
      );
      return;
    }
    setPublishMessageById((prev) => ({
      ...prev,
      [showNpmLoginModal.extensionId]: t("{{name}} publiée.", {
        name: showNpmLoginModal.extensionName,
      }),
    }));
    setTimeout(() => {
      setPublishMessageById((prev) => {
        const next = { ...prev };
        delete next[showNpmLoginModal.extensionId];
        return next;
      });
    }, 3000);
    await load();
    setBusyId(null);
    setNpmToken("");
  };

  const installedIds = new Set(extensions.map((extension) => extension.id));
  const normalizedQuery = query.trim().toLowerCase();

  const matchesExtensionQuery = useCallback(
    (item: {
      id: string;
      name: string;
      description?: string;
      author?: string;
      category?: string;
      tags?: string[];
    }) => {
      if (!normalizedQuery) return true;
      const haystack = [
        item.name,
        item.id,
        item.description,
        item.author,
        item.category,
        ...(item.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    },
    [normalizedQuery],
  );

  const installedItems = useMemo(
    () => extensions.filter((item) => matchesExtensionQuery(item)),
    [extensions, matchesExtensionQuery],
  );
  const filteredMarketplace = useMemo(() => {
    if (!marketplace) return null;

    const filterItems = (items?: ChatonsExtensionCatalogItem[]) =>
      (items ?? []).filter((item) => matchesExtensionQuery(item));

    const featured = filterItems(marketplace.featured).filter(
      (item) => item.source !== "builtin",
    );
    const recent = filterItems(marketplace.new);
    const trending = filterItems(marketplace.trending);
    const byCategory = (marketplace.byCategory ?? [])
      .map((category) => ({
        ...category,
        items: filterItems(category.items),
      }))
      .filter((category) => category.items.length > 0)
      .map((category) => ({
        ...category,
        count: category.items.length,
      }));

    return {
      featured,
      new: recent,
      trending,
      byCategory,
    };
  }, [marketplace, matchesExtensionQuery]);
  const hasMarketplaceResults =
    (filteredMarketplace?.featured?.length ?? 0) > 0 ||
    (filteredMarketplace?.new?.length ?? 0) > 0 ||
    (filteredMarketplace?.trending?.length ?? 0) > 0 ||
    (filteredMarketplace?.byCategory?.length ?? 0) > 0;
  const quickNavCategories = filteredMarketplace?.byCategory ?? [];

  const scrollToSection = useCallback((ref: RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const activeLogsExtension = useMemo(
    () =>
      extensions.find((extension) => extension.id === activeLogsExtensionId) ??
      null,
    [activeLogsExtensionId, extensions],
  );
  const activeLogsContent = activeLogsExtensionId
    ? (logsById[activeLogsExtensionId] ?? "")
    : "";

  // Open logs sheet when activeLogsExtensionId changes
  useEffect(() => {
    if (activeLogsExtensionId && !logsRendered) {
      setLogsRendered(true);
      setIsLogsClosing(false);
    }
  }, [activeLogsExtensionId]);

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
                className={`ep-mode-btn${viewMode === "updates" ? " ep-mode-btn-active" : ""}`}
                onClick={() => setViewMode("updates")}
              >
                <span>
                  {t("Mises à jour")}{" "}
                  {updatesAvailable.length > 0 && (
                    <span className="ep-mode-badge">
                      {updatesAvailable.length}
                    </span>
                  )}
                </span>
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
              {!loading && quickNavCategories.length > 0 && (
                <div
                  className="ep-marketplace-quick-nav"
                  aria-label={t("Navigation rapide des catégories")}
                >
                  <span className="ep-marketplace-quick-nav-label">
                    {t("Accès rapide")}
                  </span>
                  <div className="ep-marketplace-quick-nav-buttons">
                    {filteredMarketplace?.featured &&
                      filteredMarketplace.featured.length > 0 && (
                        <button
                          type="button"
                          className="ep-marketplace-quick-nav-btn"
                          onClick={() => scrollToSection(featuredSectionRef)}
                        >
                          {t("Recommandées")}
                        </button>
                      )}
                    {filteredMarketplace?.new &&
                      filteredMarketplace.new.length > 0 && (
                        <button
                          type="button"
                          className="ep-marketplace-quick-nav-btn"
                          onClick={() => scrollToSection(newSectionRef)}
                        >
                          {t("Récemment ajoutées")}
                        </button>
                      )}
                    {filteredMarketplace?.trending &&
                      filteredMarketplace.trending.length > 0 && (
                        <button
                          type="button"
                          className="ep-marketplace-quick-nav-btn"
                          onClick={() => scrollToSection(trendingSectionRef)}
                        >
                          {t("Les plus utiles")}
                        </button>
                      )}
                    {quickNavCategories.map((category) => (
                      <a
                        key={category.name}
                        href={`#extension-category-${category.name
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/(^-|-$)/g, "")}`}
                        className="ep-marketplace-quick-nav-btn"
                      >
                        {category.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}

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
                  {filteredMarketplace?.featured &&
                    filteredMarketplace.featured.length > 0 && (
                      <section ref={featuredSectionRef} className="ep-section">
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
                          {filteredMarketplace.featured.map((item) => (
                            <MarketplaceExtensionCard
                              key={item.id}
                              item={item}
                              isInstalled={installedIds.has(item.id)}
                              isInstalling={installingId === item.id}
                              isInstallComplete={
                                completedInstallationId === item.id
                              }
                              isBusy={busyId === item.id}
                              onInstall={() => void handleInstall(item)}
                              featured
                            />
                          ))}
                        </div>
                      </section>
                    )}

                  {/* New Section */}
                  {filteredMarketplace?.new &&
                    filteredMarketplace.new.length > 0 && (
                      <section ref={newSectionRef} className="ep-section">
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
                          {filteredMarketplace.new.map((item) => (
                            <MarketplaceExtensionCard
                              key={item.id}
                              item={item}
                              isInstalled={installedIds.has(item.id)}
                              isInstalling={installingId === item.id}
                              isInstallComplete={
                                completedInstallationId === item.id
                              }
                              isBusy={busyId === item.id}
                              onInstall={() => void handleInstall(item)}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                  {/* Trending Section */}
                  {filteredMarketplace?.trending &&
                    filteredMarketplace.trending.length > 0 && (
                      <section ref={trendingSectionRef} className="ep-section">
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
                          {filteredMarketplace.trending.map((item) => (
                            <MarketplaceExtensionCard
                              key={item.id}
                              item={item}
                              isInstalled={installedIds.has(item.id)}
                              isInstalling={installingId === item.id}
                              isInstallComplete={
                                completedInstallationId === item.id
                              }
                              isBusy={busyId === item.id}
                              onInstall={() => void handleInstall(item)}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                  {/* Categories */}
                  {filteredMarketplace?.byCategory &&
                    filteredMarketplace.byCategory.length > 0 && (
                      <>
                        {filteredMarketplace.byCategory.map((category) => (
                          <section
                            key={category.name}
                            id={`extension-category-${category.name
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "-")
                              .replace(/(^-|-$)/g, "")}`}
                            className="ep-section scroll-mt-24"
                          >
                            <div className="ep-marketplace-section-header">
                              <div>
                                <div className="ep-section-eyebrow">
                                  {t("CATÉGORIE")}
                                </div>
                                <h2 className="ep-marketplace-section-title">
                                  {category.name}{" "}
                                  <span className="ep-category-count">
                                    {category.items.length}
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
                                  isInstallComplete={
                                    completedInstallationId === item.id
                                  }
                                  isBusy={busyId === item.id}
                                  onInstall={() => void handleInstall(item)}
                                />
                              ))}
                            </div>
                          </section>
                        ))}
                      </>
                    )}
                  {!hasMarketplaceResults && normalizedQuery && (
                    <div className="ep-empty">
                      {t("Aucune extension ne correspond à votre recherche.")}
                    </div>
                  )}
                </>
              )}
            </>
          ) : viewMode === "updates" ? (
            <>
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

              {updatesAvailable.length > 0 ? (
                <>
                  <section className="ep-section">
                    <div className="ep-section-label-row">
                      <span className="ep-section-label">
                        {t("{{count}} mise(s) à jour disponible(s)").replace(
                          "{{count}}",
                          updatesAvailable.length.toString(),
                        )}
                      </span>
                      <button
                        type="button"
                        className="ep-btn-primary"
                        onClick={() => void handleUpdateAll()}
                        disabled={busyId === "all"}
                      >
                        {busyId === "all" ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("Mise à jour en cours...")}
                          </>
                        ) : (
                          t("Tout mettre à jour")
                        )}
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
                        return (
                          <div key={extension.id} className="group ep-card-row">
                            <div className="ep-card-icon">
                              <ExtensionIcon
                                iconName={
                                  typeof extension.config?.iconUrl === "string"
                                    ? extension.config.iconUrl
                                    : extension.config?.icon
                                }
                                extensionId={extension.id}
                                className="h-6 w-6 object-contain"
                              />
                            </div>
                            <div className="ep-card-body">
                              <div className="ep-card-name">
                                {extension.name}
                                <span className="ep-badge-update">
                                  {update.currentVersion} →{" "}
                                  {update.latestVersion}
                                </span>
                              </div>
                              <div className="ep-card-desc">
                                {extension.description}
                              </div>
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
                </>
              ) : (
                <div className="ep-empty">
                  {t("Aucune mise à jour disponible. Vous êtes à jour !")}
                </div>
              )}
            </>
          ) : (
            <>
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

              {installedItems.length > 0 && (
                <section className="ep-section">
                  <div className="ep-card-grid">
                    {installedItems.map((extension) => {
                      const pending = busyId === extension.id;
                      const requiresRestart =
                        extension.config?.requiresRestart === true;
                      const serverStatus =
                        serverStatusById[extension.id] ?? null;
                      const hasUpdate = updatesAvailable.some(
                        (u) => u.id === extension.id,
                      );
                      return (
                        <div key={extension.id} className="group ep-card-row">
                          <div className="ep-card-icon">
                            <ExtensionIcon
                              iconName={
                                extension.config?.iconUrl ??
                                extension.config?.icon
                              }
                              extensionId={extension.id}
                              className="h-6 w-6 object-contain"
                            />
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
                            {publishMessageById[extension.id] && (
                              <div
                                className={`ep-card-message ${publishMessageById[extension.id]?.match(/Impossible|Unable|Échec|error|failed/i) ? "ep-card-error" : "ep-card-info"}`}
                              >
                                {publishMessageById[extension.id]}
                              </div>
                            )}
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
                              <div
                                title={
                                  extension.version ===
                                    extension.npmPublishedVersion &&
                                  extension.npmPublishedVersion
                                    ? t(
                                        "Cette version est déjà publiée sur npm",
                                      )
                                    : undefined
                                }
                              >
                                <button
                                  type="button"
                                  className="ep-btn-ghost-sm"
                                  disabled={
                                    pending ||
                                    (extension.version ===
                                      extension.npmPublishedVersion &&
                                      !!extension.npmPublishedVersion)
                                  }
                                  onClick={() => void handlePublish(extension)}
                                >
                                  {t("Publier")}
                                </button>
                              </div>
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
            </>
          )}
        </div>
      </div>

      {(logsRendered && activeLogsExtension) ? (
        <div
          className={`ep-extension-logs-sheet-backdrop ${isLogsClosing ? 'ep-extension-logs-sheet-backdrop-closing' : ''}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              void handleShowLogs(activeLogsExtension);
            }
          }}
          style={{ zIndex: 50 }}
        >
          <div
            className={`ep-extension-logs-sheet ${isLogsClosing ? 'ep-extension-logs-sheet-closing' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={t("Logs")}
            onClick={(event) => event.stopPropagation()}
            style={{ zIndex: 51 }}
          >
            <div className="ep-extension-logs-header">
              <div>
                <div className="extension-modal-title">{t("Logs")}</div>
                <div className="project-terminal-subtitle">
                  {activeLogsExtension.name}
                </div>
              </div>
              <button
                type="button"
                className="sidebar-icon-button"
                onClick={() => void handleShowLogs(activeLogsExtension)}
                aria-label={t("Fermer les logs")}
                title={t("Fermer")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="ep-extension-logs-body">
              <pre className="ep-extension-logs-pre">
                {activeLogsContent || t("Aucun log trouvé")}
              </pre>
            </div>
          </div>
        </div>
      ) : null}

      {showNpmLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="ep-modal">
            <h3 className="ep-modal-title">{t("Connexion npm requise")}</h3>
            <p className="ep-modal-body">
              {t("Un token npm est nécessaire pour publier cette extension.")}
            </p>
            {hasStoredNpmToken && (
              <p className="ep-modal-body ep-modal-info">
                {t(
                  "Un token npm stocké a été trouvé. Vous pouvez le réutiliser ou en entrer un nouveau.",
                )}
              </p>
            )}
            <div className="ep-modal-field">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <label htmlFor="npmToken" className="ep-modal-label">
                  {t("Token npm")}
                </label>
                <a
                  href="https://www.npmjs.com/settings/~/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: "0.85rem",
                    color: "#0066cc",
                    textDecoration: "underline",
                  }}
                >
                  {t("Obtenir un token")}
                </a>
              </div>
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
              {hasStoredNpmToken && (
                <button
                  type="button"
                  className="ep-btn-ghost"
                  onClick={async () => {
                    await workspaceIpc.clearStoredNpmToken();
                    setHasStoredNpmToken(false);
                    setNpmToken("");
                  }}
                >
                  {t("Effacer le token stocké")}
                </button>
              )}
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
  isInstallComplete: boolean;
  isBusy: boolean;
  onInstall: () => void;
  featured?: boolean;
}

function MarketplaceExtensionCard({
  item,
  isInstalled,
  isInstalling,
  isInstallComplete,
  isBusy,
  onInstall,
  featured,
}: MarketplaceExtensionCardProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`group ep-marketplace-card${featured ? " ep-marketplace-card-featured" : ""}`}
      data-extension-id={item.id}
    >
      <div className="ep-marketplace-card-header">
        <div className="ep-marketplace-card-icon">
          <ExtensionIcon
            iconName={item.iconUrl ?? item.icon}
            extensionId={item.id}
            className="h-8 w-8 object-contain"
          />
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
          disabled={isBusy || isInstalled || isInstallComplete}
          onClick={onInstall}
        >
          {isInstallComplete ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              {t("Installée")}
            </>
          ) : isInstalling ? (
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
