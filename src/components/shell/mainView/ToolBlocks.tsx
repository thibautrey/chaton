import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
      className={`chat-tool-terminal ${isError ? "chat-tool-terminal-error" : ""}`}
    >
      <pre ref={outputRef} className="chat-tool-code">
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
      className={`chat-live-trace ${phase === "exit" ? "chat-live-trace-exit" : "chat-live-trace-enter"}`}
    >
      <ToolTerminal
        text={`bash\n${command} $\n\n${output}`}
        isError={isError}
      />
    </div>
  );
}

export function CollapsibleToolBlock({
  title,
  badge,
  startExpanded,
  children,
  maxHeight = 200,
}: {
  title: ReactNode;
  badge: ReactNode;
  startExpanded: boolean;
  children: ReactNode;
  maxHeight?: number;
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
          detailsRef.current?.open && (detailsRef.current.open = false);
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
    <section className="chat-tool-block">
      <details
        ref={detailsRef}
        className={`chat-tool-details ${isAnimating ? "chat-tool-details-animating" : ""}`}
        open={isOpen}
        onToggle={handleToggle}
      >
        <summary className="chat-tool-title chat-tool-title-row chat-tool-summary">
          <span>{title}</span>
          {badge}
        </summary>
        <div
          className="chat-tool-content"
          style={{ maxHeight: `${maxHeight}px`, overflowY: "auto" }}
        >
          {children}
        </div>
      </details>
    </section>
  );
}
