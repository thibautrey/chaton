import {
  Circle,
  Check,
  Download,
  Eye,
  FileWarning,
  Folder,
  GitBranch,
  List,
  ListTree,
  RefreshCw,
  Square,
  Terminal,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ProjectTerminalDialog } from "@/components/shell/ProjectTerminalDialog";
import { TopSheet } from "@/components/shell/TopSheet";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";
import { perfMonitor } from "@/features/workspace/store/perf-monitor";
import { GlobalNotificationDisplay } from "@/features/notifications/GlobalNotificationDisplay";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { Button } from "../ui/button";
import { TopbarExtensionItems } from "./TopbarExtensionItems";
import { TopbarGitChangesList, buildProjectTree } from "./TopbarGitChangesList";
import {
  GitDetailedReviewCard,
  GitReviewSummaryCard,
  GitValidationCard,
} from "./TopbarGitReviewCards";
import {
  inferImpactLabel,
  isSensitivePath,
  reviewStatusLabel,
  summarizeDiffExcerpt,
} from "./topbarGitUtils";
import { useTopbarGitReview } from "./useTopbarGitReview";

export function Topbar() {
  perfMonitor.recordComponentRender("Topbar");
  const {
    state,
    setNotice,
    getWorktreeGitInfo,
    generateWorktreeCommitMessage,
    commitWorktree,
    mergeWorktreeIntoMain,
    pushWorktreeBranch,
    enableConversationWorktree,
    disableConversationWorktree,
    setConversationAccessMode,
    sendPiPrompt,
  } = useWorkspace();
  const [isProjectTerminalOpen, setIsProjectTerminalOpen] = useState(false);
  const [isTracing, setIsTracing] = useState(false);
  const { t } = useTranslation();

  const selectedConversation = state.conversations.find(
    (conversation) => conversation.id === state.selectedConversationId,
  );
  const hasWorktree = Boolean(
    selectedConversation?.worktreePath &&
      selectedConversation.worktreePath.trim().length > 0,
  );

  useEffect(() => {
    if (!selectedConversation?.projectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsProjectTerminalOpen(false);
    }
  }, [selectedConversation?.id, selectedConversation?.projectId]);

  const shouldHideTopbar = state.sidebarMode === "settings";

  const openProjectFolder = async () => {
    if (!selectedConversation?.projectId) {
      return;
    }
    try {
      const result = await workspaceIpc.openProjectFolder(selectedConversation.projectId);
      if (!result.ok) {
        if (result.reason === "project_not_found") {
          setNotice(t("Projet introuvable."));
        } else {
          setNotice(t("Impossible d'ouvrir le dossier du projet."));
        }
      }
    } catch (error) {
      console.error("Error opening project folder:", error);
      setNotice(t("Impossible d'ouvrir le dossier du projet."));
    }
  };

  const handleToggleTracing = async () => {
    if (isTracing) {
      const result = await workspaceIpc.stopTracing();
      setIsTracing(false);
      if (!result.ok) {
        setNotice(result.message ?? t("Impossible d'arreter la trace."));
      } else if ("cancelled" in result && result.cancelled) {
        setNotice(t("Trace annulee."));
      } else if ("filePath" in result && result.filePath) {
        setNotice(`Trace saved: ${result.filePath}`);
      }
    } else {
      const result = await workspaceIpc.startTracing();
      if (result.ok) {
        setIsTracing(true);
        setNotice(t("Tracing started..."));
      } else {
        setNotice(result.message ?? t("Impossible de demarrer la trace."));
      }
    }
  };

  const {
    isWorktreeDialogOpen,
    worktreeInfo,
    projectGitInfo,
    isLoadingWorktreeInfo,
    isLoadingProjectGitInfo,
    commitMessage,
    setCommitMessage,
    isCommitting,
    isMerging,
    isPushing,
    isPulling,
    isEnablingWorktree,
    expandedFolders,
    setExpandedFolders,
    gitViewMode,
    setGitViewMode,
    selectedDiffPath,
    diffPreview,
    isLoadingDiffPreview,
    reviewedPaths,
    gitChecklist,
    setGitChecklist,
    isSendingGitPrompt,
    isBatchStaging,
    isRefreshingContext,
    refreshConversationContext,
    openWorktreeDialog,
    closeWorktreeDialog,
    handleWorktreeToggleClick,
    handleToggleStage,
    stageFiles,
    handleCommit,
    handleMerge,
    handlePush,
    handlePull,
    loadDiffPreview,
    sendGitFollowUpPrompt,
    stagedCount,
    changedCount,
    reviewedCount,
    lastAgentTouchedSet,
    sensitiveFiles,
    impactSummary,
    groupedChanges,
    gitSections,
    totalAddedRemoved,
    reviewStatus,
    readiness,
    reviewerSummary,
    suggestedChecks,
  } = useTopbarGitReview({
    setNotice,
    getWorktreeGitInfo,
    generateWorktreeCommitMessage,
    commitWorktree,
    mergeWorktreeIntoMain,
    pushWorktreeBranch,
    enableConversationWorktree,
    disableConversationWorktree,
    sendPiPrompt,
    selectedConversation,
    hasWorktree,
    t,
  });

  const projectTree = useMemo(
    () => buildProjectTree(projectGitInfo ?? []),
    [projectGitInfo],
  );

  if (shouldHideTopbar) {
    return null;
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">{selectedConversation?.title ?? t("Nouvelle conversation")}</div>
        </div>
        <div className="topbar-actions">
        {selectedConversation?.projectId ? (
          <>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="sidebar-icon-button"
                aria-label={t("Ouvrir le dossier du projet")}
                title={t("Ouvrir le dossier du projet")}
                onClick={openProjectFolder}
              >
                <Folder className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="sidebar-icon-button"
                aria-label={t("Ouvrir le terminal du projet")}
                title={t("Ouvrir le terminal du projet")}
                onClick={() => setIsProjectTerminalOpen(true)}
              >
                <Terminal className="h-4 w-4" />
              </button>
            </div>
            <div className="topbar-divider" />
            <button
              type="button"
              className={`sidebar-icon-button worktree-toggle-button ${hasWorktree ? "worktree-toggle-button-active" : ""}`}
              aria-label={hasWorktree ? t("Desactiver l'isolation des changements") : t("Isoler les changements de cette conversation")}
              title={hasWorktree ? t("Desactiver l'isolation des changements") : t("Isoler les changements de cette conversation")}
              onClick={handleWorktreeToggleClick}
              disabled={isEnablingWorktree}
            >
              <ListTree className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="sidebar-icon-button"
              aria-label={t("Source control")}
              title={t("Source control")}
              onClick={openWorktreeDialog}
            >
              <GitBranch className="h-4 w-4" />
            </button>
          </>
        ) : null}
        <TopbarExtensionItems />
        {import.meta.env.DEV ? (
          <button
            type="button"
            className={`sidebar-icon-button tracing-button ${isTracing ? "tracing-button-active" : ""}`}
            aria-label={isTracing ? t("Stop tracing") : t("Start tracing")}
            title={isTracing ? t("Stop tracing") : t("Start tracing")}
            onClick={handleToggleTracing}
          >
            {isTracing ? <Square className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        <div className="topbar-divider" />
        <NotificationBell />
      </div>

      {selectedConversation?.projectId ? (
        <ProjectTerminalDialog
          conversationId={selectedConversation.id}
          open={isProjectTerminalOpen}
          onClose={() => setIsProjectTerminalOpen(false)}
          setConversationAccessMode={setConversationAccessMode}
        />
      ) : null}

      <TopSheet
        open={isWorktreeDialogOpen}
        onClose={closeWorktreeDialog}
        className="git-sheet"
        footerClassName="git-sheet-actions worktree-actions"
        footer={
          <Button type="button" className="extension-modal-btn extension-modal-btn-primary" onClick={closeWorktreeDialog}>
            {t("Fermer")}
          </Button>
        }
      >
        <div className="extension-modal-title git-panel-header">
          <div>
            <div className="git-panel-title-row">
              <GitBranch className="h-4 w-4" />
              <span>{t("Source control")}</span>
            </div>
            <div className="git-panel-subtitle">
              {worktreeInfo ? `${worktreeInfo.branch} -> ${worktreeInfo.baseBranch}` : 
               projectGitInfo ? t("Statut Git du projet") : t("Chargement...")}
            </div>
          </div>
          <div className="git-panel-header-badges">
            {worktreeInfo ? (
              <>
                <span className="git-summary-pill">{stagedCount} {t("staged")}</span>
                <span className="git-summary-pill">{changedCount} {t("changements")}</span>
              </>
            ) : projectGitInfo ? (
              <span className="git-summary-pill">{projectGitInfo.length} {t("fichiers modifiés")}</span>
            ) : null}
          </div>
        </div>

        <div className="git-panel-layout">
          <div className="git-panel-left">
            <div className="git-section-card git-section-card-scrollable">
              <div className="git-section-header">
                <div>
                  <div className="git-section-title">{t("Modifications")}</div>
                  {worktreeInfo ? (
                    <div className="git-inline-meta" style={{ marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
                      <span className="git-summary-pill">{reviewStatusLabel(reviewStatus, t)}</span>
                      <span className="git-summary-pill">{reviewedCount}/{changedCount} {t("relus")}</span>
                      <span className="git-summary-pill">{sensitiveFiles.length} {t("sensibles")}</span>
                      {impactSummary.map((label) => (
                        <span key={label} className="git-summary-pill">{t(label)}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="git-section-header-right">
                  {worktreeInfo ? (
                    <span className="git-section-caption">
                      {stagedCount} {t("staged")} / {changedCount} {t("changements")}
                    </span>
                  ) : projectGitInfo ? (
                    <span className="git-section-caption">
                      {projectGitInfo.length} {t("fichiers modifiés")}
                    </span>
                  ) : null}
                  <div className="git-view-toggle" role="group" aria-label={t("Affichage des fichiers") }>
                    <Button
                      type="button"
                      variant={gitViewMode === "tree" ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setGitViewMode("tree")}
                    >
                      <ListTree className="h-4 w-4" />
                      {t("Arbre")}
                    </Button>
                    <Button
                      type="button"
                      variant={gitViewMode === "list" ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setGitViewMode("list")}
                    >
                      <List className="h-4 w-4" />
                      {t("Liste")}
                    </Button>
                  </div>
                </div>
              </div>
              {worktreeInfo ? (
                <div className="git-info-message" style={{ marginBottom: 12 }}>
                  <div className="git-inline-meta" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span className="git-summary-pill">{lastAgentTouchedSet.size} {t("fichiers touches par la conversation")}</span>
                    <span className="git-summary-pill">+{totalAddedRemoved.added} / -{totalAddedRemoved.removed}</span>
                    <span className="git-summary-pill">{groupedChanges.recent.length} {t("recents")}</span>
                    <span className="git-summary-pill">{groupedChanges.staged.length} {t("staged")}</span>
                    {sensitiveFiles.length > 0 ? <span className="git-summary-pill">{t("Verifier les fichiers sensibles")}</span> : null}
                    {isRefreshingContext ? <span className="git-summary-pill">{t("Analyse conversation...")}</span> : null}
                  </div>
                </div>
              ) : null}
              <TopbarGitChangesList
                gitSections={gitSections}
                gitViewMode={gitViewMode}
                expandedFolders={expandedFolders}
                setExpandedFolders={setExpandedFolders}
                reviewedPaths={reviewedPaths}
                lastAgentTouchedSet={lastAgentTouchedSet}
                handleToggleStage={handleToggleStage}
                loadDiffPreview={loadDiffPreview}
                projectGitInfo={projectGitInfo}
                projectTree={projectTree}
                isLoadingWorktreeInfo={isLoadingWorktreeInfo}
                isLoadingProjectGitInfo={isLoadingProjectGitInfo}
                worktreeHasChanges={Boolean(worktreeInfo && worktreeInfo.changes.length > 0)}
                t={t}
              />
            </div>
          </div>

          {worktreeInfo ? (
            <div className="git-panel-right">
              <GitReviewSummaryCard
                readiness={readiness}
                reviewerSummary={reviewerSummary}
                suggestedChecks={suggestedChecks}
                reviewStatusLabel={reviewStatusLabel}
                t={t}
              />
              <GitDetailedReviewCard
                selectedDiffPath={selectedDiffPath}
                isLoadingDiffPreview={isLoadingDiffPreview}
                diffPreview={diffPreview}
                reviewedPaths={reviewedPaths}
                inferImpactLabel={inferImpactLabel}
                summarizeDiffExcerpt={summarizeDiffExcerpt}
                t={t}
              />
              <GitValidationCard
                worktreeInfo={worktreeInfo}
                reviewStatus={reviewStatus}
                reviewStatusLabel={reviewStatusLabel}
                reviewedCount={reviewedCount}
                changedCount={changedCount}
                lastAgentTouchedCount={lastAgentTouchedSet.size}
                readiness={readiness}
                isBatchStaging={isBatchStaging}
                stageFiles={stageFiles}
                changes={worktreeInfo.changes ?? []}
                lastAgentTouchedSet={lastAgentTouchedSet}
                isSensitivePath={isSensitivePath}
                groupedChanges={{
                  recent: groupedChanges.recent,
                  sensitive: groupedChanges.sensitive,
                  remaining: groupedChanges.remaining,
                }}
                sensitiveFilesCount={sensitiveFiles.length}
                gitChecklist={gitChecklist}
                setGitChecklist={setGitChecklist}
                commitMessage={commitMessage}
                setCommitMessage={setCommitMessage}
                isCommitting={isCommitting}
                handleCommit={handleCommit}
                isPushing={isPushing}
                handlePush={handlePush}
                isPulling={isPulling}
                handlePull={handlePull}
                isMerging={isMerging}
                handleMerge={handleMerge}
                isSendingGitPrompt={isSendingGitPrompt}
                sendGitFollowUpPrompt={sendGitFollowUpPrompt}
                t={t}
              />

              <div className="git-section-card git-section-card-tight">
                <div className="git-section-header">
                  <div className="git-section-title">{t("Synchronisation")}</div>
                  <div className="git-sync-status git-inline-meta">
                    <span>{t("Mergé")}: <strong>{worktreeInfo?.isMergedIntoBase ? t("Oui") : t("Non")}</strong></span>
                    <span>{t("Pushé")}: <strong>{worktreeInfo?.isPushedToUpstream ? t("Oui") : t("Non")}</strong></span>
                    <span>{t("Git natif")}: <strong>{worktreeInfo?.nativeGitAvailable ? t("Oui") : t("Non")}</strong></span>
                  </div>
                </div>
                <div className="git-info-message" style={{ marginBottom: 12 }}>
                  {t("Cette vue sert a comprendre, relire, valider puis integrer les changements produits dans cette conversation.")}
                </div>
                <div className="git-sync-actions" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                  <Button type="button" variant="outline" size="sm" onClick={() => sendGitFollowUpPrompt('explain')} disabled={isSendingGitPrompt}>
                    <Eye className="h-4 w-4" />
                    {t("Demander une explication")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => sendGitFollowUpPrompt('reduce')} disabled={isSendingGitPrompt}>
                    <RefreshCw className="h-4 w-4" />
                    {t("Reduire le diff")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => sendGitFollowUpPrompt('tests')} disabled={isSendingGitPrompt}>
                    <Check className="h-4 w-4" />
                    {t("Ajouter les tests manquants")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => sendGitFollowUpPrompt('fix-file')} disabled={isSendingGitPrompt}>
                    <FileWarning className="h-4 w-4" />
                    {t("Corriger seulement ce fichier")}
                  </Button>
                </div>
                <div className="git-sync-actions">
                  <Button type="button" variant="outline" size="sm" onClick={handlePull} disabled={isPulling}>
                    <Download className="h-4 w-4" />
                    {isPulling ? t("Pull...") : t("Pull")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handlePush} disabled={isPushing}>
                    <Upload className="h-4 w-4" />
                    {isPushing ? t("Push...") : t("Push")}
                  </Button>
                </div>
                {!worktreeInfo?.nativeGitAvailable ? (
                  <div className="git-info-message">
                    {t("Certaines operations Git avancees, comme le merge automatique, requierent Git natif.")}
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="git-merge-btn"
                  onClick={handleMerge}
                  disabled={isMerging || !worktreeInfo?.nativeGitAvailable || readiness.score < 75}
                  title={!worktreeInfo?.nativeGitAvailable ? t("Le merge automatique requiert Git natif") : readiness.score < 75 ? t("Finalise la revue avant le merge") : undefined}
                >
                  {isMerging ? t("Merge...") : t(`Merger vers ${worktreeInfo?.baseBranch ?? "main"}`)}
                </Button>
              </div>
            </div>
          ) : projectGitInfo ? (
            <div className="git-panel-right">
              <div className="git-section-card git-section-card-tight">
                <div className="git-section-header">
                  <div className="git-section-title">{t("Isolation des changements")}</div>
                  <span className="git-section-caption">
                    {hasWorktree ? t("Worktree actif") : t("Dépôt principal")}
                  </span>
                </div>
                <div className="git-info-message">
                  {hasWorktree
                    ? t("Ces modifications sont isolees dans une branche de travail dediee a cette conversation.")
                    : t("Ces modifications sont dans le depot principal du projet. Active l'isolation pour separer le travail de cette conversation sur une branche dediee.")}
                </div>
                <div className="git-info-message" style={{ marginTop: 12 }}>
                  {t("Objectif: voir, comprendre, valider puis integrer ce que l'agent a change.")}
                </div>
                <div className="git-project-actions">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleWorktreeToggleClick}
                    disabled={isEnablingWorktree}
                    style={{ width: '100%' }}
                  >
                    <ListTree className="h-4 w-4 mr-2" />
                    {hasWorktree ? t("Desactiver l'isolation") : t("Isoler les changements de cette conversation")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openProjectFolder}
                    style={{ width: '100%' }}
                  >
                    <Folder className="h-4 w-4 mr-2" />
                    {hasWorktree ? t("Ouvrir le worktree dans le Finder") : t("Ouvrir le projet dans le Finder")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={refreshConversationContext}
                    style={{ width: '100%' }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t("Rafraichir l'analyse de conversation")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </TopSheet>
  </header>
  <GlobalNotificationDisplay />
</>);
}
