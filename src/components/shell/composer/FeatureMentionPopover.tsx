import { Loader2, Zap } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { workspaceIpc } from "@/services/ipc/workspace";

export type FeatureMentionResult = {
  /** The feature type (e.g., "skill") */
  type: "skill";
  /** The skill source identifier */
  source: string;
  /** The formatted skill title */
  title: string;
};

type Props = {
  /** Whether the popover is visible */
  isOpen: boolean;
  /** Current query typed after the / character */
  query: string;
  /** Position (in px) relative to parent for anchoring */
  anchorRect: { left: number; bottom: number } | null;
  /** Called when a feature is selected */
  onSelect: (result: FeatureMentionResult) => void;
  /** Called when the popover should close without selection */
  onClose: () => void;
  /** Ref to the textarea for keyboard event coordination */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

type InstalledSkill = {
  source: string;
  path: string;
};

function parsePiListOutput(stdout: string): InstalledSkill[] {
  const lines = stdout.split(/\r?\n/);
  const out: InstalledSkill[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const sourceMatch = lines[i].match(
      /^\s{2}([^\s].*?)\s*(\(filtered\))?\s*$/,
    );
    if (!sourceMatch) continue;

    const source = sourceMatch[1].trim();
    const installed = !sourceMatch[2];
    if (!installed) continue;

    const next = lines[i + 1] ?? "";
    const pathMatch = next.match(/^\s{4}(.+)$/);
    const path = pathMatch ? pathMatch[1].trim() : "";

    out.push({ source, path });
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

export function FeatureMentionPopover({
  isOpen,
  query,
  anchorRect,
  onSelect,
  onClose,
  textareaRef,
}: Props) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search skills when query changes
  useEffect(() => {
    if (!isOpen) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      const result = await workspaceIpc.runPiCommand("list");
      if (result.ok) {
        const parsed = parsePiListOutput(result.stdout);
        // Filter by query
        const normalizedQuery = query.trim().toLowerCase();
        const filtered = normalizedQuery
          ? parsed.filter(
              (skill) =>
                skill.source.toLowerCase().includes(normalizedQuery) ||
                formatSkillTitle(skill.source).toLowerCase().includes(normalizedQuery) ||
                getSkillDescription(skill.source).toLowerCase().includes(normalizedQuery)
            )
          : parsed;
        setSkills(filtered);
      } else {
        setSkills([]);
      }
      setIsLoading(false);
      setActiveIndex(0);
    }, 80);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen]);

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
      if (!isOpen || skills.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((prev) => (prev + 1) % skills.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((prev) => (prev - 1 + skills.length) % skills.length);
      } else if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const selectedSkill = skills[activeIndex];
        if (selectedSkill) {
          onSelect({
            type: "skill",
            source: selectedSkill.source,
            title: formatSkillTitle(selectedSkill.source),
          });
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [isOpen, skills, activeIndex, onSelect, onClose],
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

  // Render skill item
  const renderSkillItem = (skill: InstalledSkill, index: number) => {
    const title = formatSkillTitle(skill.source);
    const description = getSkillDescription(skill.source);
    const isActive = index === activeIndex;

    return (
      <button
        key={skill.source}
        type="button"
        className={`feature-mention-item ${isActive ? "feature-mention-item-active" : ""}`}
        onMouseEnter={() => setActiveIndex(index)}
        onMouseDown={(e) => {
          e.preventDefault(); // Prevent textarea blur
          onSelect({
            type: "skill",
            source: skill.source,
            title,
          });
        }}
      >
        <div className="feature-mention-icon">
          <Zap className="h-4 w-4" />
        </div>
        <div className="feature-mention-content">
          <div className="feature-mention-title">{title}</div>
          <div className="feature-mention-description">{description}</div>
        </div>
        <div className="feature-mention-source">{skill.source}</div>
      </button>
    );
  };

  return (
    <div
      className="feature-mention-popover"
      style={{
        left: anchorRect.left,
        bottom: anchorRect.bottom,
      }}
    >
      <div className="feature-mention-header">
        <span className="feature-mention-label">{t("Skills")}</span>
        <span className="feature-mention-hint">{t("Activate a skill for this conversation")}</span>
      </div>
      {isLoading && skills.length === 0 ? (
        <div className="feature-mention-loading">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("Loading skills...")}</span>
        </div>
      ) : skills.length === 0 ? (
        <div className="feature-mention-empty">
          {query.trim()
            ? t("No skills found matching") + ` "${query}"`
            : t("No skills installed")}
        </div>
      ) : (
        <div className="feature-mention-list" ref={listRef}>
          {skills.map((skill, index) => renderSkillItem(skill, index))}
        </div>
      )}
      <div className="feature-mention-hint-bar">
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
