import { useEffect, useMemo, useRef, useState, type ReactNode, memo } from "react";

import { sanitizeTerminalText } from "@/components/shell/mainView/terminal";

export function ToolTerminal({
  text,
  isError = false,
}: {
  text: string;
  isError?: boolean;
}) {
  const outputRef = useRef<HTMLPreElement | null>(null);
  const sanitizedText = useMemo(() => sanitizeTerminalText(text), [text]);

  useEffect(() => {
    const node = outputRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [sanitizedText]);

  return (
    <div
      className={`w-full overflow-hidden rounded-md border bg-[#090f1a] ${isError ? "border-[#4a2431] bg-[#23121a]" : "border-[#1c2534]"}`}
    >
      <pre ref={outputRef} className={`w-full overflow-auto p-3 font-mono text-[12px] leading-5 break-words whitespace-pre-wrap ${isError ? "text-[#ffdbe3]" : "text-[#eef2ff]"}`} style={{ maxHeight: 'calc(1.25rem * 10 + 1.5rem)' }}>
        {sanitizedText}
      </pre>
    </div>
  );
}

export function LiveToolTrace({
  command,
  output,
  isRunning,
  isError = false,
}: {
  command: string;
  output: string;
  isRunning: boolean;
  isError?: boolean;
}) {
  const [phase, setPhase] = useState<"hidden" | "enter" | "exit">(
    isRunning ? "enter" : "hidden",
  );
  const prevRunningRef = useRef(isRunning);

  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    prevRunningRef.current = isRunning;

    let enterTimer: number | undefined;
    let exitTimer: number | undefined;
    let hideTimer: number | undefined;

    if (isRunning && !wasRunning) {
      enterTimer = window.setTimeout(() => setPhase("enter"), 0);
    }

    if (!isRunning && wasRunning) {
      exitTimer = window.setTimeout(() => setPhase("exit"), 0);
      hideTimer = window.setTimeout(() => setPhase("hidden"), 380);
    }

    return () => {
      if (enterTimer !== undefined) window.clearTimeout(enterTimer);
      if (exitTimer !== undefined) window.clearTimeout(exitTimer);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    };
  }, [isRunning]);

  if (!isRunning && phase === "hidden") {
    return (
      <ToolTerminal
        text={`bash\n${command} $\n\n${output}`}
        isError={isError}
      />
    );
  }

  return (
    <div
      className="overflow-hidden"
      style={{
        transformOrigin: 'top',
        animation:
          phase === 'exit'
            ? 'chat-live-trace-out 320ms cubic-bezier(0.3, 0, 0.8, 0.15) forwards'
            : 'chat-live-trace-in 380ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      }}
    >
      <ToolTerminal
        text={`bash\n${command} $\n\n${output}`}
        isError={isError}
      />
    </div>
  );
}

export const CollapsibleToolBlock = memo(function CollapsibleToolBlock({
  title,
  badge,
  startExpanded,
  children,
  maxHeight = 200,
  summarySuffix,
}: {
  title: ReactNode;
  badge: ReactNode;
  startExpanded: boolean;
  children: ReactNode;
  maxHeight?: number;
  summarySuffix?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(startExpanded);
  const [isAnimating, setIsAnimating] = useState(false);
  const userInteractedRef = useRef(false);
  const prevStartExpandedRef = useRef(startExpanded);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    const wasExpanded = prevStartExpandedRef.current;
    prevStartExpandedRef.current = startExpanded;

    // If startExpanded changed, track the transition
    if (startExpanded !== wasExpanded && detailsRef.current) {
      // If parent signals to expand (startExpanded: false → true), respect it
      // unless user manually closed this block
      if (startExpanded && !wasExpanded && !userInteractedRef.current) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsAnimating(true);
        detailsRef.current.open = true;
        setIsOpen(true);
        // Reset animation flag after animation completes
        const timer = setTimeout(() => setIsAnimating(false), 400);
        return () => clearTimeout(timer);
      }

      // If parent signals to collapse (startExpanded: true → false), always collapse
      // This happens when tool finishes, so force the collapse regardless of user interaction
      if (!startExpanded && wasExpanded) {
        userInteractedRef.current = false;
        setIsAnimating(true);
        // Delay the actual closing to allow CSS animation to play
        const timer = setTimeout(() => {
          if (detailsRef.current?.open) {
            detailsRef.current.open = false;
          }
          setIsOpen(false);
          setIsAnimating(false);
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [startExpanded]);

  const handleToggle = (event: React.ToggleEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    userInteractedRef.current = true;
    setIsAnimating(true);
    setIsOpen(nextOpen);
    // Reset animation flag after animation completes
    setTimeout(() => setIsAnimating(false), nextOpen ? 400 : 350);
  };

  return (
    <section className="w-full min-w-0 pl-0" style={{ contain: 'layout style paint' }}>
      <details
        ref={detailsRef}
        className={`w-full min-w-0 rounded-lg border-0 ${isAnimating ? "pointer-events-none" : ""}`}
        open={isOpen}
        onToggle={handleToggle}
      >
        <summary className="mb-0.5 list-none cursor-pointer rounded-md px-2 py-1 text-left text-[12px] text-[#6e7a92] transition-colors duration-200 ease-out hover:bg-[#edf2fb] flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className="block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">{title}</span>
            {summarySuffix ? <span className="inline-flex shrink-0 items-center rounded-full border border-[#d7dfea] bg-[#f5f7fb] px-2 py-0.5 text-[10px] font-medium text-[#6e7a92]">{summarySuffix}</span> : null}
          </span>
          {badge}
        </summary>
        <div
          className="min-w-0 overflow-hidden pb-0.5"
          style={{
            maxHeight: `${maxHeight}px`,
            overflowY: 'auto',
            animation: isOpen
              ? 'chat-tool-content-expand 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
              : 'chat-tool-content-collapse 380ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            pointerEvents: isOpen ? 'auto' : 'none',
          }}
        >
          {children}
        </div>
      </details>
    </section>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo: skip re-render if only props that don't affect visual are the same
  return (
    prevProps.title === nextProps.title &&
    prevProps.badge === nextProps.badge &&
    prevProps.startExpanded === nextProps.startExpanded &&
    prevProps.children === nextProps.children &&
    prevProps.maxHeight === nextProps.maxHeight &&
    prevProps.summarySuffix === nextProps.summarySuffix
  );
});
