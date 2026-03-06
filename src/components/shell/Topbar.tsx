import { GitBranch, Terminal } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ProjectTerminalDialog } from "@/components/shell/ProjectTerminalDialog";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";

export function Topbar() {
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
  } = useWorkspace();
  const [isWorktreeDialogOpen, setIsWorktreeDialogOpen] = useState(false);
  const [isProjectTerminalOpen, setIsProjectTerminalOpen] = useState(false);
  const [worktreeInfo, setWorktreeInfo] = useState<{
    worktreePath: string;
    branch: string;
    baseBranch: string;
    hasChanges: boolean;
    hasStagedChanges: boolean;
    hasUncommittedChanges: boolean;
    ahead: number;
    behind: number;
    isMergedIntoBase: boolean;
    isPushedToUpstream: boolean;
  } | null>(null);
  const [isLoadingWorktreeInfo, setIsLoadingWorktreeInfo] = useState(false);
  const [isGeneratingCommitMessage, setIsGeneratingCommitMessage] =
    useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isEnablingWorktree, setIsEnablingWorktree] = useState(false);
  const [isVscodeDetected, setIsVscodeDetected] = useState(false);
  const [isCheckingVscode, setIsCheckingVscode] = useState(false);
  const { t } = useTranslation();

  const selectedConversation = state.conversations.find(
    (conversation) => conversation.id === state.selectedConversationId,
  );
  const hasWorktree = Boolean(
    selectedConversation?.worktreePath &&
    selectedConversation.worktreePath.trim().length > 0,
  );

  useEffect(() => {
    if (!hasWorktree) {
      setIsWorktreeDialogOpen(false);
      setWorktreeInfo(null);
      setCommitMessage("");
    }
  }, [hasWorktree, selectedConversation?.id]);

  useEffect(() => {
    if (!selectedConversation?.projectId) {
      setIsProjectTerminalOpen(false);
    }
  }, [selectedConversation?.id, selectedConversation?.projectId]);

  useEffect(() => {
    if (!isWorktreeDialogOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsWorktreeDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isWorktreeDialogOpen]);

  useEffect(() => {
    const checkVscode = async () => {
      setIsCheckingVscode(true);
      try {
        const result = await workspaceIpc.detectVscode();
        setIsVscodeDetected(result.detected);
      } catch {
        setIsVscodeDetected(false);
      } finally {
        setIsCheckingVscode(false);
      }
    };
    checkVscode();
  }, []);

  if (state.sidebarMode === "settings") {
    return null;
  }

  const refreshWorktreeInfo = async () => {
    if (!selectedConversation?.id) {
      return;
    }
    setIsLoadingWorktreeInfo(true);
    try {
      const result = await getWorktreeGitInfo(selectedConversation.id);
      if (!result.ok) {
        setNotice(
          result.message ?? "Impossible de charger les infos du worktree.",
        );
        return;
      }
      setWorktreeInfo(result);
    } finally {
      setIsLoadingWorktreeInfo(false);
    }
  };

  const openWorktreeDialog = async () => {
    if (!selectedConversation?.id || !hasWorktree) {
      return;
    }
    setIsWorktreeDialogOpen(true);
    await refreshWorktreeInfo();
  };

  const handleWorktreeToggleClick = async () => {
    if (!selectedConversation?.id || isEnablingWorktree) {
      return;
    }
    if (hasWorktree) {
      setIsEnablingWorktree(true);
      try {
        const result = await disableConversationWorktree(
          selectedConversation.id,
        );
        if (!result.ok) {
          setNotice(
            result.reason === "has_uncommitted_changes"
              ? t("Impossible de désactiver: modifications non commitées.")
              : t("Impossible de désactiver le worktree."),
          );
          return;
        }
        setIsWorktreeDialogOpen(false);
        setWorktreeInfo(null);
        setCommitMessage("");
        setNotice(t("Worktree désactivé."));
      } finally {
        setIsEnablingWorktree(false);
      }
      return;
    }

    setIsEnablingWorktree(true);
    try {
      const updatedConversation = await enableConversationWorktree(
        selectedConversation.id,
      );
      if (!updatedConversation?.worktreePath) {
        return;
      }
      setNotice(t("Worktree activé."));
      setIsWorktreeDialogOpen(true);
      await refreshWorktreeInfo();
    } finally {
      setIsEnablingWorktree(false);
    }
  };

  const openWorktreeInVscode = async () => {
    if (
      !selectedConversation?.id ||
      !hasWorktree ||
      !selectedConversation.worktreePath
    ) {
      return;
    }
    try {
      const result = await workspaceIpc.openWorktreeInVscode(
        selectedConversation.worktreePath,
      );
      if (!result.success) {
        setNotice(result.error ?? "Impossible d'ouvrir VS Code.");
      }
    } catch {
      setNotice("Impossible d'ouvrir VS Code.");
    }
  };

  const handleGenerateCommitMessage = async () => {
    if (!selectedConversation?.id) {
      return;
    }
    setIsGeneratingCommitMessage(true);
    try {
      const result = await generateWorktreeCommitMessage(
        selectedConversation.id,
      );
      if (!result.ok) {
        setNotice(
          result.reason === "no_changes"
            ? t("Aucune modification à commit.")
            : (result.message ??
                t("Impossible de générer un message de commit.")),
        );
        return;
      }
      setCommitMessage(result.message);
    } finally {
      setIsGeneratingCommitMessage(false);
    }
  };

  const handleCommit = async () => {
    if (!selectedConversation?.id || isCommitting) {
      return;
    }
    setIsCommitting(true);
    try {
      const result = await commitWorktree(
        selectedConversation.id,
        commitMessage,
      );
      if (!result.ok) {
        setNotice(
          result.reason === "empty_message"
            ? t("Message de commit requis.")
            : result.reason === "no_changes"
              ? t("Aucune modification à commit.")
              : (result.message ?? t("Commit impossible.")),
        );
        return;
      }
      setNotice(`Commit créé: ${result.commit}`);
      await refreshWorktreeInfo();
    } finally {
      setIsCommitting(false);
    }
  };

  const handleMerge = async () => {
    if (!selectedConversation?.id || isMerging) {
      return;
    }
    setIsMerging(true);
    try {
      const result = await mergeWorktreeIntoMain(selectedConversation.id);
      if (!result.ok) {
        setNotice(
          result.reason === "already_merged"
            ? "La branche est déjà mergée dans main."
            : result.reason === "merge_conflicts"
              ? "Merge impossible: des conflits de merge doivent être résolus."
              : (result.message ?? "Merge impossible."),
        );
        return;
      }
      setNotice(result.message);
      await refreshWorktreeInfo();
    } finally {
      setIsMerging(false);
    }
  };

  const handlePush = async () => {
    if (!selectedConversation?.id || isPushing) {
      return;
    }
    setIsPushing(true);
    try {
      const result = await pushWorktreeBranch(selectedConversation.id);
      if (!result.ok) {
        setNotice(result.message ?? "Push impossible.");
        return;
      }
      setNotice(`Push effectué: ${result.remote}/${result.branch}`);
      await refreshWorktreeInfo();
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-title">
        {selectedConversation?.title ?? t("Nouveau fil")}
      </div>
      <div className="topbar-actions">
        {selectedConversation?.projectId ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="sidebar-icon-button"
              aria-label={t("Ouvrir le terminal du projet")}
              title={t("Ouvrir le terminal du projet")}
              onClick={() => setIsProjectTerminalOpen(true)}
            >
              <Terminal className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`sidebar-icon-button worktree-toggle-button ${hasWorktree ? "worktree-toggle-button-active" : ""}`}
              aria-label={
                hasWorktree ? t("Désactiver worktree") : t("Activer worktree")
              }
              title={
                hasWorktree ? t("Désactiver worktree") : t("Activer worktree")
              }
              onClick={handleWorktreeToggleClick}
              disabled={isEnablingWorktree}
            >
              <GitBranch className="h-4 w-4" />
            </button>
            {hasWorktree ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="top-pill top-pill-default"
                onClick={openWorktreeDialog}
              >
                {t("Gérer worktree")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {hasWorktree && isVscodeDetected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="top-pill top-pill-vscode"
            onClick={openWorktreeInVscode}
            disabled={isCheckingVscode}
          >
            {isCheckingVscode ? (
              t("Vérification...")
            ) : (
              <img
                src="/src/assets/vscode.webp"
                alt="VS Code"
                className="vscode-icon"
              />
            )}
          </Button>
        ) : null}
      </div>

      {selectedConversation?.projectId ? (
        <ProjectTerminalDialog
          conversationId={selectedConversation.id}
          open={isProjectTerminalOpen}
          onClose={() => setIsProjectTerminalOpen(false)}
        />
      ) : null}

      {isWorktreeDialogOpen ? (
        <div
          className="extension-modal-backdrop"
          onClick={() => setIsWorktreeDialogOpen(false)}
        >
          <div
            className="extension-modal max-w-[680px]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="extension-modal-title">
              {t("Gestion du worktree")}
            </div>
            <div className="queue-panel-content">
              {isLoadingWorktreeInfo ? (
                <div className="queue-panel-row">{t("Chargement...")}</div>
              ) : worktreeInfo ? (
                <>
                  <div className="queue-panel-row">
                    <span>{t("Branche")}</span>
                    <strong>{worktreeInfo.branch}</strong>
                  </div>
                  <div className="queue-panel-row">
                    <span>{t("Base")}</span>
                    <strong>{worktreeInfo.baseBranch}</strong>
                  </div>
                  <div className="queue-panel-row">
                    <span>{t("Commits en avance")}</span>
                    <strong>{worktreeInfo.ahead}</strong>
                  </div>
                  <div className="queue-panel-row">
                    <span>{t("Commits en retard")}</span>
                    <strong>{worktreeInfo.behind}</strong>
                  </div>
                  <div className="queue-panel-row">
                    <span>{t("Déjà mergé dans la base")}</span>
                    <strong>
                      {worktreeInfo.isMergedIntoBase ? t("Oui") : t("Non")}
                    </strong>
                  </div>
                  <div className="queue-panel-row">
                    <span>{t("Déjà pushé (upstream)")}</span>
                    <strong>
                      {worktreeInfo.isPushedToUpstream ? t("Oui") : t("Non")}
                    </strong>
                  </div>
                </>
              ) : (
                <div className="queue-panel-error">
                  {t("Impossible de lire le worktree")}
                </div>
              )}
              <div className="worktree-commit-box">
                <label
                  className="worktree-commit-label"
                  htmlFor="worktree-commit-message"
                >
                  {t("Message de commit")}
                </label>
                <textarea
                  id="worktree-commit-message"
                  className="worktree-commit-textarea"
                  rows={4}
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  placeholder={t("Écrire un message de commit...")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateCommitMessage}
                  disabled={isGeneratingCommitMessage}
                >
                  {isGeneratingCommitMessage
                    ? t("Génération...")
                    : t("Générer un message")}
                </Button>
              </div>
            </div>
            <div className="extension-modal-actions worktree-actions">
              <Button
                type="button"
                className="extension-modal-btn extension-modal-btn-primary"
                onClick={handleCommit}
                disabled={isCommitting}
              >
                {isCommitting ? t("Commit...") : t("Committer")}
              </Button>
              <Button
                type="button"
                className="extension-modal-btn extension-modal-btn-primary"
                onClick={handleMerge}
                disabled={isMerging}
              >
                {isMerging ? t("Merge...") : t("Merger vers main")}
              </Button>
              <Button
                type="button"
                className="extension-modal-btn extension-modal-btn-primary"
                onClick={handlePush}
                disabled={isPushing}
              >
                {isPushing ? t("Push...") : t("Push")}
              </Button>
              <Button
                type="button"
                className="extension-modal-btn extension-modal-btn-primary"
                onClick={() => setIsWorktreeDialogOpen(false)}
              >
                {t("Fermer")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
