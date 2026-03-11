import { FileText, Folder, Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { workspaceIpc } from "@/services/ipc/workspace";

export type FileMentionResult = {
  /** The file path that was selected */
  path: string;
};

type Props = {
  /** Whether the popover is visible */
  isOpen: boolean;
  /** Current query typed after the @ character */
  query: string;
  /** Conversation ID for file search context */
  conversationId: string | null;
  /** Project ID for file search context */
  projectId: string | null;
  /** Position (in px) relative to parent for anchoring */
  anchorRect: { left: number; bottom: number } | null;
  /** Called when a file is selected */
  onSelect: (result: FileMentionResult) => void;
  /** Called when the popover should close without selection */
  onClose: () => void;
  /** Ref to the textarea for keyboard event coordination */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export function FileMentionPopover({
  isOpen,
  query,
  conversationId,
  projectId,
  anchorRect,
  onSelect,
  onClose,
  textareaRef,
}: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search files when query changes
  useEffect(() => {
    if (!isOpen) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      const result = await workspaceIpc.searchProjectFiles(
        query,
        conversationId,
        projectId,
      );
      if (result.ok) {
        setFiles(result.files);
      } else {
        setFiles([]);
      }
      setIsLoading(false);
      setActiveIndex(0);
    }, 80);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen, conversationId, projectId]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeItem = listRef.current.children[activeIndex] as HTMLElement;
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // Intercept keyboard events on the textarea
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || files.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((prev) => (prev + 1) % files.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((prev) => (prev - 1 + files.length) % files.length);
      } else if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onSelect({ path: files[activeIndex] });
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [isOpen, files, activeIndex, onSelect, onClose],
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !isOpen) return;
    textarea.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      textarea.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      });
    };
  }, [handleKeyDown, isOpen, textareaRef]);

  if (!isOpen || !anchorRect) return null;

  const getFileIcon = (filePath: string) => {
    const lastSegment = filePath.split("/").pop() ?? "";
    if (lastSegment.includes(".")) {
      return <FileText className="file-mention-icon" />;
    }
    return <Folder className="file-mention-icon" />;
  };

  // Split path into directory + filename for styled display
  const renderFilePath = (filePath: string) => {
    const lastSlash = filePath.lastIndexOf("/");
    if (lastSlash === -1) {
      return <span className="file-mention-name">{filePath}</span>;
    }
    const dir = filePath.slice(0, lastSlash + 1);
    const name = filePath.slice(lastSlash + 1);
    return (
      <>
        <span className="file-mention-dir">{dir}</span>
        <span className="file-mention-name">{name}</span>
      </>
    );
  };

  return (
    <div
      className="file-mention-popover"
      style={{
        left: anchorRect.left,
        bottom: anchorRect.bottom,
      }}
    >
      {isLoading && files.length === 0 ? (
        <div className="file-mention-loading">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Searching files...</span>
        </div>
      ) : files.length === 0 ? (
        <div className="file-mention-empty">No files found</div>
      ) : (
        <div className="file-mention-list" ref={listRef}>
          {files.map((file, index) => (
            <button
              key={file}
              type="button"
              className={`file-mention-item ${index === activeIndex ? "file-mention-item-active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent textarea blur
                onSelect({ path: file });
              }}
            >
              {getFileIcon(file)}
              <span className="file-mention-path">{renderFilePath(file)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="file-mention-hint">
        <span>
          <kbd>Tab</kbd> or <kbd>Enter</kbd> to select
        </span>
        <span>
          <kbd>Esc</kbd> to dismiss
        </span>
      </div>
    </div>
  );
}
