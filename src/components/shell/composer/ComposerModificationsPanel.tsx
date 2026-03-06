import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseDiffLines } from "./diff";
import type { FileDiffDetails, ModifiedFileStat } from "./types";

type ComposerModificationsPanelProps = {
  composerKey: string;
  files: ModifiedFileStat[];
  totals: { files: number; added: number; removed: number };
  isWorkingOnChanges: boolean;
  selectedConversationId: string | null;
  showModificationsList: boolean;
  hasInlineDiffOpen: boolean;
  openDiffPaths: Record<string, boolean>;
  diffLoadingByPath: Record<string, boolean>;
  diffErrorByPath: Record<string, string | null>;
  diffByPath: Record<string, FileDiffDetails>;
  currentChangeIndexByPath: Record<string, number>;
  onTogglePanel: () => void;
  onStopPi: (conversationId: string) => void;
  onToggleDiffForFile: (path: string) => void;
  onScrollToChange: (path: string, index: number) => void;
  onSetDiffLineContainerRef: (path: string, element: HTMLDivElement | null) => void;
  onSetFirstDiffChangeRef: (path: string, element: HTMLDivElement | null) => void;
  onSetDiffChangeRef: (path: string, index: number, element: HTMLDivElement | null) => void;
  t: (value: string) => string;
};

export function ComposerModificationsPanel({
  files,
  totals,
  isWorkingOnChanges,
  selectedConversationId,
  showModificationsList,
  hasInlineDiffOpen,
  openDiffPaths,
  diffLoadingByPath,
  diffErrorByPath,
  diffByPath,
  currentChangeIndexByPath,
  onTogglePanel,
  onStopPi,
  onToggleDiffForFile,
  onScrollToChange,
  onSetDiffLineContainerRef,
  onSetFirstDiffChangeRef,
  onSetDiffChangeRef,
  t,
}: ComposerModificationsPanelProps) {
  return (
    <div
      className={`composer-mods-panel ${showModificationsList ? "composer-mods-panel-open" : "composer-mods-panel-closed"} ${hasInlineDiffOpen ? "composer-mods-panel-inline-open" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="composer-mods-header">
        <button
          type="button"
          className="composer-mods-title"
          onClick={onTogglePanel}
          aria-label={showModificationsList ? t("Masquer les modifications") : t("Afficher les modifications")}
          title={showModificationsList ? t("Masquer les modifications") : t("Afficher les modifications")}
        >
          {totals.files} {totals.files > 1 ? t("fichiers modifies") : t("fichier modifie")} <span className="chat-inline-diff-plus">+{totals.added}</span>{" "}
          <span className="chat-inline-diff-minus">-{totals.removed}</span>
        </button>
        {isWorkingOnChanges && selectedConversationId ? (
          <Button
            type="button"
            variant="ghost"
            className="composer-mods-action"
            onClick={() => {
              const confirmed = window.confirm(
                "Êtes-vous sûr de vouloir annuler l'opération en cours ?\n\nToutes les modifications en cours seront perdues.",
              );
              if (confirmed) {
                onStopPi(selectedConversationId);
              }
            }}
          >
            Annuler
          </Button>
        ) : (
          <button
            type="button"
            className={`composer-mods-action composer-mods-toggle ${showModificationsList ? "is-closed" : "is-open"}`}
            onClick={onTogglePanel}
            aria-label={showModificationsList ? "Masquer les modifications" : "Afficher les modifications"}
            title={showModificationsList ? "Masquer les modifications" : "Afficher les modifications"}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className={`composer-mods-list ${showModificationsList ? "is-open" : "is-closed"}`}>
        {files.slice(0, 12).map((file) => {
          const isOpen = openDiffPaths[file.path] ?? false;
          const isLoading = diffLoadingByPath[file.path] ?? false;
          const error = diffErrorByPath[file.path];
          const details = diffByPath[file.path];
          const parsedLines = details ? parseDiffLines(details.lines, details.firstChangedLine) : [];
          const lineBlockIndexes: Array<number | null> = new Array(parsedLines.length).fill(null);
          const blockAnchorLineIndexes: number[] = [];
          let currentBlockIndex = -1;
          let currentBlockAnchor: number | null = null;
          parsedLines.forEach((line, lineIndex) => {
            if (line.raw.startsWith("@@")) {
              if (currentBlockIndex >= 0 && currentBlockAnchor !== null) {
                blockAnchorLineIndexes.push(currentBlockAnchor);
              }
              currentBlockIndex += 1;
              currentBlockAnchor = null;
              return;
            }
            if (line.isChangeContent && currentBlockIndex >= 0) {
              lineBlockIndexes[lineIndex] = currentBlockIndex;
              if (currentBlockAnchor === null) {
                currentBlockAnchor = lineIndex;
              }
            }
          });
          if (currentBlockIndex >= 0 && currentBlockAnchor !== null) {
            blockAnchorLineIndexes.push(currentBlockAnchor);
          }
          const changeCount = blockAnchorLineIndexes.length;
          const currentIndex = Math.min(
            currentChangeIndexByPath[file.path] ?? 0,
            Math.max(0, changeCount - 1),
          );

          return (
            <div key={file.path} className={`composer-mods-row-wrap ${isOpen ? "is-open" : ""}`}>
              <div className="composer-mods-row">
                <button
                  type="button"
                  className="composer-mods-path"
                  onClick={() => onToggleDiffForFile(file.path)}
                  title="Ouvrir le diff inline"
                >
                  {file.path}
                </button>
                <span className="composer-mods-counts">
                  <span className="chat-inline-diff-plus">+{file.added}</span>
                  <span className="chat-inline-diff-minus">-{file.removed}</span>
                </span>
              </div>
              <div className={`composer-mods-inline ${isOpen ? "is-open" : "is-closed"}`}>
                {isOpen ? (
                  <>
                    {isLoading ? <div className="composer-mods-inline-note">Chargement du diff…</div> : null}
                    {!isLoading && error ? <div className="composer-mods-inline-error">{error}</div> : null}
                    {!isLoading && !error && details ? (
                      <div className="chat-diff-file">
                        <div className="chat-diff-file-header">
                          <code>{details.path}</code>
                          <div className="composer-mods-inline-nav">
                            <button
                              type="button"
                              className="composer-mods-inline-nav-btn"
                              onClick={() => onScrollToChange(file.path, currentIndex - 1)}
                              disabled={changeCount === 0 || currentIndex <= 0}
                              aria-label="Aller au changement précédent"
                              title="Changement précédent"
                            >
                              ↑
                            </button>
                            <span className="chat-diff-more">
                              {changeCount === 0 ? "0 / 0" : `${currentIndex + 1} / ${changeCount}`}
                            </span>
                            <button
                              type="button"
                              className="composer-mods-inline-nav-btn"
                              onClick={() => onScrollToChange(file.path, currentIndex + 1)}
                              disabled={changeCount === 0 || currentIndex >= changeCount - 1}
                              aria-label="Aller au changement suivant"
                              title="Changement suivant"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                        <div
                          className="chat-diff-lines"
                          ref={(element) => {
                            onSetDiffLineContainerRef(file.path, element);
                          }}
                        >
                          {details.isBinary ? (
                            <div className="chat-diff-line-neutral">Fichier binaire: aperçu texte indisponible.</div>
                          ) : (
                            parsedLines.map((line, index) => {
                              const rawBlockIndex = lineBlockIndexes[index];
                              const changeIndexForLine =
                                rawBlockIndex !== null && rawBlockIndex < changeCount
                                  ? rawBlockIndex
                                  : null;
                              const isCurrentChange =
                                changeIndexForLine !== null && changeIndexForLine === currentIndex;
                              const lineClassName = `${line.className}${isCurrentChange ? " chat-diff-line-current-change" : ""}`;

                              return (
                                <div
                                  key={`${details.path}:${index}`}
                                  className={lineClassName}
                                  ref={(element) => {
                                    if (
                                      line.isChangeContent &&
                                      changeIndexForLine !== null &&
                                      blockAnchorLineIndexes[changeIndexForLine] === index
                                    ) {
                                      onSetDiffChangeRef(file.path, changeIndexForLine, element);
                                    }
                                    if (line.className.includes("chat-diff-line-first-change")) {
                                      onSetFirstDiffChangeRef(file.path, element);
                                    }
                                  }}
                                >
                                  <span className="chat-diff-line-number-old">
                                    {line.oldLine !== null ? line.oldLine : ""}
                                  </span>
                                  <span className="chat-diff-line-number-new">
                                    {line.newLine !== null ? line.newLine : ""}
                                  </span>
                                  <span className="chat-diff-line-content">
                                    {line.raw.length > 0 ? line.raw : " "}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
