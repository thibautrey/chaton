import { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";

export function Topbar() {
  const {
    state,
    sendPiPrompt,
    setNotice,
    getWorktreeGitInfo,
    generateWorktreeCommitMessage,
    commitWorktree,
    mergeWorktreeIntoMain,
    pushWorktreeBranch,
  } = useWorkspace();
  const [isQueueDialogOpen, setIsQueueDialogOpen] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [isWorktreeDialogOpen, setIsWorktreeDialogOpen] = useState(false);
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
  const [isGeneratingCommitMessage, setIsGeneratingCommitMessage] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isVscodeDetected, setIsVscodeDetected] = useState(false);
  const [isCheckingVscode, setIsCheckingVscode] = useState(false);
  const { t } = useTranslation();

  const selectedConversation = state.conversations.find(
    (conversation) => conversation.id === state.selectedConversationId,
  );
  const runtime = selectedConversation
    ? state.piByConversation[selectedConversation.id]
    : null;
  const shouldShowQueuePill = Boolean(runtime && runtime.pendingCommands > 0);
  const canSendNow = Boolean(
    selectedConversation?.id &&
      runtime?.pendingUserMessage &&
      runtime?.pendingUserMessageText &&
      !isSendingNow,
  );
  const hasWorktree = Boolean(
    selectedConversation?.worktreePath &&
      selectedConversation.worktreePath.trim().length > 0,
  );

  useEffect(() => {
    if (!shouldShowQueuePill) {
      setIsQueueDialogOpen(false);
    }
  }, [shouldShowQueuePill]);

  useEffect(() => {
    if (!hasWorktree) {
      setIsWorktreeDialogOpen(false);
      setWorktreeInfo(null);
      setCommitMessage("");
    }
  }, [hasWorktree, selectedConversation?.id]);

  useEffect(() => {
    if (!isQueueDialogOpen && !isWorktreeDialogOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsQueueDialogOpen(false);
        setIsWorktreeDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isQueueDialogOpen, isWorktreeDialogOpen]);

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

  const handleSendNow = async () => {
    if (
      !selectedConversation?.id ||
      !runtime?.pendingUserMessage ||
      !runtime.pendingUserMessageText ||
      isSendingNow
    ) {
      return;
    }
    setIsSendingNow(true);
    try {
      await sendPiPrompt({
        conversationId: selectedConversation.id,
        message: runtime.pendingUserMessageText,
        steer: true,
      });
      setIsQueueDialogOpen(false);
    } finally {
      setIsSendingNow(false);
    }
  };

  const refreshWorktreeInfo = async () => {
    if (!selectedConversation?.id) {
      return;
    }
    setIsLoadingWorktreeInfo(true);
    try {
      const result = await getWorktreeGitInfo(selectedConversation.id);
      if (!result.ok) {
        setNotice(result.message ?? "Impossible de charger les infos du worktree.");
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

  const openWorktreeInVscode = async () => {
    if (!selectedConversation?.id || !hasWorktree || !selectedConversation.worktreePath) {
      return;
    }
    try {
      const result = await workspaceIpc.openWorktreeInVscode(selectedConversation.worktreePath);
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
      const result = await generateWorktreeCommitMessage(selectedConversation.id);
      if (!result.ok) {
        setNotice(
          result.reason === "no_changes"
            ? t("Aucune modification à commit.")
            : result.message ?? t("Impossible de générer un message de commit."),
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
      const result = await commitWorktree(selectedConversation.id, commitMessage);
      if (!result.ok) {
        setNotice(
          result.reason === "empty_message"
            ? t("Message de commit requis.")
            : result.reason === "no_changes"
              ? t("Aucune modification à commit.")
              : result.message ?? t("Commit impossible."),
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
            : result.message ?? "Merge impossible.",
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
        {hasWorktree && isVscodeDetected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="top-pill top-pill-vscode"
            onClick={openWorktreeInVscode}
            disabled={isCheckingVscode}
          >
            {isCheckingVscode ? t("Vérification...") : "📋 VS Code"}
          </Button>
        ) : null}
      </div>

      {isQueueDialogOpen && runtime ? (
        <div
          className="extension-modal-backdrop"
          onClick={() => setIsQueueDialogOpen(false)}
        >
          <div
            className="extension-modal max-w-[560px]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="extension-modal-title">{t("Queue Pi")}</div>
            <div className="queue-panel-content">
              <div className="queue-panel-row">
                <span>{t("Commandes en attente")}</span>
                <strong>{runtime.pendingCommands}</strong>
              </div>
              <div className="queue-panel-row">
                <span>{t("Message utilisateur en attente")}</span>
                <strong>
                  {runtime.pendingUserMessage ? t("Oui") : t("Non")}
                </strong>
              </div>
              <div className="queue-panel-row">
                <span>{t("État runtime")}</span>
                <strong>{runtime.status}</strong>
              </div>
              {runtime.state ? (
                <div className="queue-panel-row">
                  <span>{t("Messages en attente (session Pi)")}</span>
                  <strong>{runtime.state.pendingMessageCount}</strong>
                </div>
              ) : null}
              {runtime.lastError ? (
                <div className="queue-panel-error">{runtime.lastError}</div>
              ) : null}
            </div>
            <div className="extension-modal-actions">
              <button
                type="button"
                className="extension-modal-btn extension-modal-btn-primary"
                onClick={handleSendNow}
                disabled={!canSendNow}
              >
                {isSendingNow ? t("Envoi...") : t("Envoyer maintenant (steer)")}
              </button>
              <button
                type="button"
                className="extension-modal-btn extension-modal-btn-primary"
                onClick={() => setIsQueueDialogOpen(false)}
              >
                {t("Fermer")}
              </button>
            </div>
          </div>
        </div>
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
            <div className="extension-modal-title">{t("Gestion du worktree")}</div>
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
                    <strong>{worktreeInfo.isMergedIntoBase ? t("Oui") : t("Non")}</strong>
                  </div>
                  <div className="queue-panel-row">
                    <span>{t("Déjà pushé (upstream)")}</span>
                    <strong>{worktreeInfo.isPushedToUpstream ? t("Oui") : t("Non")}</strong>
                  </div>
                </>
              ) : (
                <div className="queue-panel-error">
                  {t("Impossible de lire le worktree")}
                </div>
              )}
              <div className="worktree-commit-box">
                <label className="worktree-commit-label" htmlFor="worktree-commit-message">
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
