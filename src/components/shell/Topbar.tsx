import {
  ChevronDown,
  ChevronRight,
  Circle,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  Sparkles,
  Square,
  Terminal,
  Tree,
  Upload,
  Download,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectTerminalDialog } from "@/components/shell/ProjectTerminalDialog";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/workspace/store";
import { workspaceIpc } from "@/services/ipc/workspace";
import { perfMonitor } from "@/features/workspace/store/perf-monitor";

type WorktreeFileChange = {
  path: string;
  x: string;
  y: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  deleted: boolean;
  renamed: boolean;
};

type WorktreeInfo = {
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
  changes: WorktreeFileChange[];
};

type TreeNode = {
  name: string;
  path: string;
  children: TreeNode[];
  file?: WorktreeFileChange;
};

function buildTree(files: WorktreeFileChange[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const lookup = new Map<string, TreeNode>();

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let currentPath = "";
    let siblings = roots;

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let node = lookup.get(currentPath);
      if (!node) {
        node = { name: part, path: currentPath, children: [] };
        lookup.set(currentPath, node);
        siblings.push(node);
      }
      if (index === parts.length - 1) {
        node.file = file;
      }
      siblings = node.children;
    });
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      const aDir = !a.file;
      const bDir = !b.file;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);

  return roots;
}

function statusLabel(file: WorktreeFileChange, t: (value: string) => string) {
  if (file.untracked) return t("Nouveau");
  if (file.deleted) return t("Supprimé");
  if (file.renamed) return t("Renommé");
  if (file.staged && file.unstaged) return t("Index + modifications");
  if (file.staged) return t("Staged");
  return t("Modifié");
}

function statusBadgeClass(file: WorktreeFileChange) {
  if (file.untracked) return "git-status-badge git-status-badge-added";
  if (file.deleted) return "git-status-badge git-status-badge-deleted";
  if (file.renamed) return "git-status-badge git-status-badge-renamed";
  if (file.staged) return "git-status-badge git-status-badge-staged";
  return "git-status-badge git-status-badge-modified";
}

function TreeRow({
  node,
  level,
  expanded,
  onToggle,
  onToggleStage,
  t,
}: {
  node: TreeNode;
  level: number;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
  onToggleStage: (file: WorktreeFileChange) => void;
  t: (value: string) => string;
}) {
  const isFolder = !node.file;
  const isOpen = expanded[node.path] ?? true;

  return (
    <>
      <div className="git-tree-row" style={{ paddingLeft: `${level * 14 + 8}px` }}>
        <div className="git-tree-main">
          {isFolder ? (
            <button
              type="button"
              className="git-tree-disclosure"
              onClick={() => onToggle(node.path)}
              aria-label={isOpen ? t("Réduire") : t("Déplier")}
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="git-tree-disclosure git-tree-disclosure-spacer" />
          )}
          <span className={`git-tree-name ${isFolder ? "git-tree-folder" : "git-tree-file"}`}>
            {node.name}
          </span>
        </div>
        {node.file ? (
          <div className="git-tree-actions">
            <span className={statusBadgeClass(node.file)}>{statusLabel(node.file, t)}</span>
            <Button
              type="button"
              variant={node.file.staged ? "secondary" : "outline"}
              size="sm"
              className="git-file-stage-btn"
              onClick={() => onToggleStage(node.file!)}
            >
              {node.file.staged ? t("Unstage") : t("Stage")}
            </Button>
          </div>
        ) : null}
      </div>
      {isFolder && isOpen
        ? node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              level={level + 1}
              expanded={expanded}
              onToggle={onToggle}
              onToggleStage={onToggleStage}
              t={t}
            />
          ))
        : null}
    </>
  );
}

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
  } = useWorkspace();
  const [isWorktreeDialogOpen, setIsWorktreeDialogOpen] = useState(false);
  const [isProjectTerminalOpen, setIsProjectTerminalOpen] = useState(false);
  const [worktreeInfo, setWorktreeInfo] = useState<WorktreeInfo | null>(null);
  const [isLoadingWorktreeInfo, setIsLoadingWorktreeInfo] = useState(false);
  const [isGeneratingCommitMessage, setIsGeneratingCommitMessage] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isEnablingWorktree, setIsEnablingWorktree] = useState(false);
  const [isVscodeDetected, setIsVscodeDetected] = useState(false);
  const [isCheckingVscode, setIsCheckingVscode] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [stageBusyPath, setStageBusyPath] = useState<string | null>(null);
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

  const shouldHideTopbar = state.sidebarMode === "settings";

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
      const nextInfo: WorktreeInfo = result;
      setWorktreeInfo(nextInfo);
      setExpandedFolders((current) => {
        const next = { ...current };
        for (const file of nextInfo.changes) {
          const parts = file.path.split("/").filter(Boolean);
          let currentPath = "";
          parts.slice(0, -1).forEach((part: string) => {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!(currentPath in next)) {
              next[currentPath] = true;
            }
          });
        }
        return next;
      });
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
        const result = await disableConversationWorktree(selectedConversation.id);
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
      const updatedConversation = await enableConversationWorktree(selectedConversation.id);
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

  const handleToggleStage = async (file: WorktreeFileChange) => {
    if (!selectedConversation?.id || stageBusyPath) {
      return;
    }
    setStageBusyPath(file.path);
    try {
      const result = file.staged
        ? await workspaceIpc.unstageWorktreeFile(selectedConversation.id, file.path)
        : await workspaceIpc.stageWorktreeFile(selectedConversation.id, file.path);
      if (!result.ok) {
        setNotice(result.message ?? t("Impossible de mettre à jour le staging."));
        return;
      }
      await refreshWorktreeInfo();
    } finally {
      setStageBusyPath(null);
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
      setCommitMessage("");
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

  const handlePull = async () => {
    if (!selectedConversation?.id || isPulling) {
      return;
    }
    setIsPulling(true);
    try {
      const result = await workspaceIpc.pullWorktreeBranch(selectedConversation.id);
      if (!result.ok) {
        setNotice(result.message ?? "Pull impossible.");
        return;
      }
      setNotice(`Pull effectué: ${result.remote}/${result.branch}`);
      await refreshWorktreeInfo();
    } finally {
      setIsPulling(false);
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

  const tree = useMemo(
    () => buildTree(worktreeInfo?.changes ?? []),
    [worktreeInfo?.changes],
  );
  const stagedCount = worktreeInfo?.changes.filter((file) => file.staged).length ?? 0;
  const changedCount = worktreeInfo?.changes.length ?? 0;

  if (shouldHideTopbar) {
    return null;
  }

  return (
    <header className="topbar">
      <div className="topbar-title">{selectedConversation?.title ?? t("Nouveau fil")}</div>
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
              aria-label={hasWorktree ? t("Désactiver worktree") : t("Activer worktree")}
              title={hasWorktree ? t("Désactiver worktree") : t("Activer worktree")}
              onClick={handleWorktreeToggleClick}
              disabled={isEnablingWorktree}
            >
              <Tree className="h-4 w-4" />
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
              <img src="/src/assets/vscode.webp" alt="VS Code" className="vscode-icon" />
            )}
          </Button>
        ) : null}
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
      </div>

      {selectedConversation?.projectId ? (
        <ProjectTerminalDialog
          conversationId={selectedConversation.id}
          open={isProjectTerminalOpen}
          onClose={() => setIsProjectTerminalOpen(false)}
        />
      ) : null}

      {isWorktreeDialogOpen ? (
        <div className="extension-modal-backdrop" onClick={() => setIsWorktreeDialogOpen(false)}>
          <div
            className="extension-modal git-panel-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="extension-modal-title git-panel-header">
              <div>
                <div className="git-panel-title-row">
                  <GitBranch className="h-4 w-4" />
                  <span>{t("Source control")}</span>
                </div>
                <div className="git-panel-subtitle">
                  {worktreeInfo ? `${worktreeInfo.branch} -> ${worktreeInfo.baseBranch}` : t("Chargement...")}
                </div>
              </div>
              <div className="git-panel-header-badges">
                <span className="git-summary-pill">{stagedCount} {t("staged")}</span>
                <span className="git-summary-pill">{changedCount} {t("changements")}</span>
              </div>
            </div>

            <div className="git-panel-layout">
              <div className="git-panel-left">
                <div className="git-section-card">
                  <div className="git-section-title">{t("Modifications")}</div>
                  {isLoadingWorktreeInfo ? (
                    <div className="queue-panel-row">{t("Chargement...")}</div>
                  ) : worktreeInfo ? (
                    worktreeInfo.changes.length > 0 ? (
                      <div className="git-tree-list">
                        {tree.map((node) => (
                          <TreeRow
                            key={node.path}
                            node={node}
                            level={0}
                            expanded={expandedFolders}
                            onToggle={(path) =>
                              setExpandedFolders((current) => ({
                                ...current,
                                [path]: !(current[path] ?? true),
                              }))
                            }
                            onToggleStage={handleToggleStage}
                            t={t}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="git-empty-state">{t("Aucune modification détectée.")}</div>
                    )
                  ) : (
                    <div className="queue-panel-error">{t("Impossible de lire le worktree")}</div>
                  )}
                </div>
              </div>

              <div className="git-panel-right">
                <div className="git-section-card">
                  <div className="git-section-title">{t("Commit")}</div>
                  <div className="git-commit-meta">
                    <span>{t("En avance")}: <strong>{worktreeInfo?.ahead ?? 0}</strong></span>
                    <span>{t("En retard")}: <strong>{worktreeInfo?.behind ?? 0}</strong></span>
                  </div>
                  <Input
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.target.value)}
                    placeholder={t("Écrire un message de commit...")}
                    className="git-commit-input"
                  />
                  <div className="git-commit-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateCommitMessage}
                      disabled={isGeneratingCommitMessage}
                    >
                      <Sparkles className="h-4 w-4" />
                      {isGeneratingCommitMessage ? t("Génération...") : t("Générer")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCommit}
                      disabled={isCommitting}
                    >
                      <GitCommitHorizontal className="h-4 w-4" />
                      {isCommitting ? t("Commit...") : t("Commit")}
                    </Button>
                  </div>
                </div>

                <div className="git-section-card">
                  <div className="git-section-title">{t("Synchronisation")}</div>
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
                  <div className="git-sync-status">
                    <span>{t("Mergé")}: <strong>{worktreeInfo?.isMergedIntoBase ? t("Oui") : t("Non")}</strong></span>
                    <span>{t("Pushé")}: <strong>{worktreeInfo?.isPushedToUpstream ? t("Oui") : t("Non")}</strong></span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="git-merge-btn"
                    onClick={handleMerge}
                    disabled={isMerging}
                  >
                    {isMerging ? t("Merge...") : t("Merger vers main")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="extension-modal-actions worktree-actions">
              <Button type="button" className="extension-modal-btn extension-modal-btn-primary" onClick={() => setIsWorktreeDialogOpen(false)}>
                {t("Fermer")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
