/* eslint-disable react-refresh/only-export-components */
import { Check, ChevronDown, ChevronRight, Eye, Folder } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import type {
  GitChangeSection,
  GitViewMode,
  ProjectFileChange,
  ProjectTreeNode,
  TreeNode,
  WorktreeFileChange,
} from "./topbarGitTypes";

function statusLabel(file: WorktreeFileChange, t: (value: string) => string) {
  if (file.untracked) return t("Nouveau");
  if (file.deleted) return t("Supprime");
  if (file.renamed) return t("Renomme");
  if (file.staged && file.unstaged) return t("Index + modifications");
  if (file.staged) return t("Staged");
  return t("Modifie");
}

function statusBadgeClass(file: WorktreeFileChange) {
  if (file.deleted) return "git-status-badge git-status-deleted";
  if (file.untracked) return "git-status-badge git-status-untracked";
  if (file.renamed) return "git-status-badge git-status-renamed";
  if (file.staged && file.unstaged) return "git-status-badge git-status-mixed";
  if (file.staged) return "git-status-badge git-status-staged";
  return "git-status-badge git-status-modified";
}

function projectStatusLabel(file: ProjectFileChange, t: (value: string) => string) {
  switch (file.status) {
    case 'added':
      return t("Ajoute");
    case 'modified':
      return t("Modifie");
    case 'deleted':
      return t("Supprime");
    case 'renamed':
      return t("Renomme");
    case 'untracked':
      return t("Non suivi");
    case 'copied':
      return t("Copie");
    case 'unmerged':
      return t("Non fusionne");
    case 'ignored':
      return t("Ignore");
    default:
      return t("Modifie");
  }
}

function projectStatusBadgeClass(file: ProjectFileChange) {
  switch (file.status) {
    case 'deleted':
      return "git-status-badge git-status-deleted";
    case 'added':
    case 'untracked':
      return "git-status-badge git-status-untracked";
    case 'renamed':
      return "git-status-badge git-status-renamed";
    default:
      return "git-status-badge git-status-modified";
  }
}

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

function buildProjectTree(files: ProjectFileChange[]): ProjectTreeNode[] {
  const roots: ProjectTreeNode[] = [];
  const lookup = new Map<string, ProjectTreeNode>();

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

  const sortNodes = (nodes: ProjectTreeNode[]) => {
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

type TreeRowProps = {
  node: TreeNode;
  level: number;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
  onToggleStage: (file: WorktreeFileChange) => void;
  onOpenDiff: (path: string) => void;
  reviewed: boolean;
  isRecent: boolean;
  t: (value: string) => string;
};

function TreeRow({ node, level, expanded, onToggle, onToggleStage, onOpenDiff, reviewed, isRecent, t }: TreeRowProps) {
  const isDirectory = !node.file;
  const isExpanded = expanded[node.path] ?? true;
  return (
    <div>
      <div className="git-tree-row" style={{ paddingLeft: level * 14 }}>
        <div className="git-tree-main">
          {isDirectory ? (
            <button type="button" className="git-tree-toggle" onClick={() => onToggle(node.path)}>
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="git-tree-toggle-placeholder" />
          )}
          {isDirectory ? <Folder className="h-4 w-4 git-tree-folder" /> : null}
          <span className={`git-tree-name ${node.file ? "git-tree-file" : "git-tree-folder-name"}`} title={node.path}>
            {node.name}
          </span>
        </div>
        {node.file ? (
          <div className="git-tree-actions">
            {isRecent ? <span className="git-path-chip git-path-chip-recent">{t("Derniere action IA")}</span> : null}
            {reviewed ? <span className="git-path-chip git-path-chip-reviewed">{t("Relu")}</span> : null}
            <span className={statusBadgeClass(node.file)}>{statusLabel(node.file, t)}</span>
            <button type="button" className="git-icon-button" onClick={() => onToggleStage(node.file!)} title={node.file.staged ? t("Retirer du stage") : t("Stage") }>
              <Check className="h-4 w-4" />
            </button>
            <button type="button" className="git-icon-button" onClick={() => onOpenDiff(node.file!.path)} title={t("Ouvrir la revue") }>
              <Eye className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
      {isDirectory && isExpanded
        ? node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              level={level + 1}
              expanded={expanded}
              onToggle={onToggle}
              onToggleStage={onToggleStage}
              onOpenDiff={onOpenDiff}
              reviewed={Boolean(child.file && reviewed)}
              isRecent={isRecent}
              t={t}
            />
          ))
        : null}
    </div>
  );
}

type WorktreeListRowProps = {
  file: WorktreeFileChange;
  onToggleStage: (file: WorktreeFileChange) => void;
  onOpenDiff: (path: string) => void;
  reviewed: boolean;
  isRecent: boolean;
  t: (value: string) => string;
};

function WorktreeListRow({ file, onToggleStage, onOpenDiff, reviewed, isRecent, t }: WorktreeListRowProps) {
  return (
    <div className="git-tree-row git-list-row">
      <div className="git-tree-main">
        <span className="git-tree-name git-tree-file" title={file.path}>
          {file.path}
        </span>
      </div>
      <div className="git-tree-actions">
        {isRecent ? <span className="git-path-chip git-path-chip-recent">{t("Derniere action IA")}</span> : null}
        {reviewed ? <span className="git-path-chip git-path-chip-reviewed">{t("Relu")}</span> : null}
        <span className={statusBadgeClass(file)}>{statusLabel(file, t)}</span>
        <button type="button" className="git-icon-button" onClick={() => onToggleStage(file)} title={file.staged ? t("Retirer du stage") : t("Stage") }>
          <Check className="h-4 w-4" />
        </button>
        <button type="button" className="git-icon-button" onClick={() => onOpenDiff(file.path)} title={t("Ouvrir la revue") }>
          <Eye className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

type ProjectTreeRowProps = {
  node: ProjectTreeNode;
  level: number;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
  t: (value: string) => string;
};

function ProjectTreeRow({ node, level, expanded, onToggle, t }: ProjectTreeRowProps) {
  const isDirectory = !node.file;
  const isExpanded = expanded[node.path] ?? true;
  return (
    <div>
      <div className="git-tree-row" style={{ paddingLeft: level * 14 }}>
        <div className="git-tree-main">
          {isDirectory ? (
            <button type="button" className="git-tree-toggle" onClick={() => onToggle(node.path)}>
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="git-tree-toggle-placeholder" />
          )}
          {isDirectory ? <Folder className="h-4 w-4 git-tree-folder" /> : null}
          <span className={`git-tree-name ${node.file ? "git-tree-file" : "git-tree-folder-name"}`} title={node.path}>
            {node.name}
          </span>
        </div>
        {node.file ? (
          <div className="git-tree-actions">
            <span className={projectStatusBadgeClass(node.file)}>{projectStatusLabel(node.file, t)}</span>
            <span className="git-project-change-stats">
              {node.file.added > 0 && <span className="git-change-added">+{node.file.added}</span>}
              {node.file.removed > 0 && <span className="git-change-removed">-{node.file.removed}</span>}
            </span>
          </div>
        ) : null}
      </div>
      {isDirectory && isExpanded
        ? node.children.map((child) => (
            <ProjectTreeRow key={child.path} node={child} level={level + 1} expanded={expanded} onToggle={onToggle} t={t} />
          ))
        : null}
    </div>
  );
}

function ProjectListRow({ file, t }: { file: ProjectFileChange; t: (value: string) => string }) {
  return (
    <div className="git-tree-row git-list-row">
      <div className="git-tree-main">
        <span className="git-tree-name git-tree-file" title={file.path}>
          {file.path}
        </span>
      </div>
      <div className="git-tree-actions">
        <span className={projectStatusBadgeClass(file)}>{projectStatusLabel(file, t)}</span>
        <span className="git-project-change-stats">
          {file.added > 0 && <span className="git-change-added">+{file.added}</span>}
          {file.removed > 0 && <span className="git-change-removed">-{file.removed}</span>}
        </span>
      </div>
    </div>
  );
}

type TopbarGitChangesListProps = {
  gitSections: GitChangeSection[];
  gitViewMode: GitViewMode;
  expandedFolders: Record<string, boolean>;
  setExpandedFolders: Dispatch<SetStateAction<Record<string, boolean>>>;
  reviewedPaths: Record<string, boolean>;
  lastAgentTouchedSet: Set<string>;
  handleToggleStage: (file: WorktreeFileChange) => void;
  loadDiffPreview: (path: string) => void;
  projectGitInfo: ProjectFileChange[] | null;
  projectTree: ProjectTreeNode[];
  isLoadingWorktreeInfo: boolean;
  isLoadingProjectGitInfo: boolean;
  worktreeHasChanges: boolean;
  t: (value: string) => string;
};

export function TopbarGitChangesList(props: TopbarGitChangesListProps) {
  const {
    gitSections,
    gitViewMode,
    expandedFolders,
    setExpandedFolders,
    reviewedPaths,
    lastAgentTouchedSet,
    handleToggleStage,
    loadDiffPreview,
    projectGitInfo,
    projectTree,
    isLoadingWorktreeInfo,
    isLoadingProjectGitInfo,
    worktreeHasChanges,
    t,
  } = props;

  if (isLoadingWorktreeInfo || isLoadingProjectGitInfo) {
    return <div className="queue-panel-row">{t("Chargement...")}</div>;
  }

  if (worktreeHasChanges) {
    return (
      <div className="git-tree-list">
        {gitSections.map((section) => (
          <div key={section.key} style={{ marginBottom: 14 }}>
            <div className="git-section-caption" style={{ marginBottom: 8 }}>{t(section.title)} ({section.files.length})</div>
            {gitViewMode === "tree"
              ? buildTree(section.files).map((node) => (
                  <TreeRow
                    key={`${section.key}:${node.path}`}
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
                    onOpenDiff={loadDiffPreview}
                    reviewed={Boolean(reviewedPaths[node.path])}
                    isRecent={lastAgentTouchedSet.has(node.path)}
                    t={t}
                  />
                ))
              : section.files.map((file) => (
                  <WorktreeListRow
                    key={`${section.key}:${file.path}`}
                    file={file}
                    onToggleStage={handleToggleStage}
                    onOpenDiff={loadDiffPreview}
                    reviewed={Boolean(reviewedPaths[file.path])}
                    isRecent={lastAgentTouchedSet.has(file.path)}
                    t={t}
                  />
                ))}
          </div>
        ))}
      </div>
    );
  }

  if (projectGitInfo) {
    return projectGitInfo.length > 0 ? (
      <div className="git-tree-list">
        {gitViewMode === "tree"
          ? projectTree.map((node) => (
              <ProjectTreeRow
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
                t={t}
              />
            ))
          : projectGitInfo.map((file) => <ProjectListRow key={file.path} file={file} t={t} />)}
      </div>
    ) : (
      <div className="git-empty-state">{t("Aucune modification détectée.")}</div>
    );
  }

  return <div className="queue-panel-error">{t("Impossible de lire les informations Git")}</div>;
}

export { buildProjectTree };
