import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Play, Square, Terminal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sanitizeTerminalText } from "@/components/shell/mainView/terminal";
import { workspaceIpc } from "@/services/ipc/workspace";

type CommandOption = {
  id: string;
  label: string;
  command: string;
  args: string[];
  source: string;
  cwd?: string;
};

type CustomCommandHistoryItem = {
  id: string;
  commandText: string;
  lastUsedAt: string;
};

type TerminalEvent = {
  seq: number;
  stream: "stdout" | "stderr" | "meta";
  text: string;
};

type TerminalRun = {
  id: string;
  title: string;
  commandLabel: string;
  commandPreview: string;
  status: "running" | "exited" | "failed" | "stopped";
  exitCode: number | null;
  startedAt: string;
  endedAt: string | null;
  events: TerminalEvent[];
  lastSeq: number;
};

export function ProjectTerminalDialog({
  conversationId,
  open,
  onClose,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [projectType, setProjectType] = useState("unknown");
  const [commands, setCommands] = useState<CommandOption[]>([]);
  const [selectedCommandId, setSelectedCommandId] = useState("");
  const [customCommands, setCustomCommands] = useState<CustomCommandHistoryItem[]>([]);
  const [customCommandText, setCustomCommandText] = useState("");
  const [runs, setRuns] = useState<TerminalRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const result = await workspaceIpc.detectProjectCommands(conversationId);
        if (cancelled) return;
        if (result.ok) {
          setProjectType(result.projectType);
          setCommands(result.commands);
          setCustomCommands(result.customCommands);
          setSelectedCommandId((current) => current || result.commands[0]?.id || "custom:new");
        } else {
          setProjectType("unknown");
          setCommands([]);
          setCustomCommands([]);
          setSelectedCommandId("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId, open]);

  useEffect(() => {
    if (!open || runs.length === 0) {
      return;
    }
    const timer = window.setInterval(async () => {
      const activeRuns = runs.filter((run) => run.status === "running");
      if (activeRuns.length === 0) return;
      const updates = await Promise.all(
        activeRuns.map(async (run) => ({ runId: run.id, result: await workspaceIpc.readProjectCommandTerminal(run.id, run.lastSeq) })),
      );
      setRuns((current) =>
        current.map((run) => {
          const match = updates.find((entry) => entry.runId === run.id);
          if (!match || !match.result.ok) return run;
          return {
            ...run,
            title: match.result.run.title,
            commandLabel: match.result.run.commandLabel,
            commandPreview: match.result.run.commandPreview,
            status: match.result.run.status,
            exitCode: match.result.run.exitCode,
            startedAt: match.result.run.startedAt,
            endedAt: match.result.run.endedAt,
            events: run.events.concat(match.result.events),
            lastSeq: match.result.events.length > 0 ? match.result.events[match.result.events.length - 1].seq : run.lastSeq,
          };
        }),
      );
    }, 700);
    return () => window.clearInterval(timer);
  }, [open, runs]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const activeRun = useMemo(
    () => runs.find((run) => run.id === activeRunId) ?? runs[0] ?? null,
    [activeRunId, runs],
  );

  const activeRunText = useMemo(() => {
    if (!activeRun) return "";
    return sanitizeTerminalText(activeRun.events.map((event) => event.text).join(""));
  }, [activeRun]);

  const startRun = async () => {
    if (!selectedCommandId || starting) return;
    if (selectedCommandId === "custom:new" && !customCommandText.trim()) return;
    setStarting(true);
    try {
      const result = await workspaceIpc.startProjectCommandTerminal(
        conversationId,
        selectedCommandId,
        selectedCommandId === "custom:new" ? customCommandText : undefined,
      );
      if (!result.ok) return;
      const snapshot = await workspaceIpc.readProjectCommandTerminal(result.runId);
      if (!snapshot.ok) return;
      const nextRun: TerminalRun = {
        id: snapshot.run.id,
        title: snapshot.run.title,
        commandLabel: snapshot.run.commandLabel,
        commandPreview: snapshot.run.commandPreview,
        status: snapshot.run.status,
        exitCode: snapshot.run.exitCode,
        startedAt: snapshot.run.startedAt,
        endedAt: snapshot.run.endedAt,
        events: snapshot.events,
        lastSeq: snapshot.events.length > 0 ? snapshot.events[snapshot.events.length - 1].seq : 0,
      };
      setRuns((current) => [nextRun, ...current]);
      setActiveRunId(nextRun.id);
      if (selectedCommandId === "custom:new") {
        const refresh = await workspaceIpc.detectProjectCommands(conversationId);
        if (refresh.ok) {
          setCustomCommands(refresh.customCommands);
        }
      }
    } finally {
      setStarting(false);
    }
  };

  const stopRun = async (runId: string) => {
    await workspaceIpc.stopProjectCommandTerminal(runId);
    const snapshot = await workspaceIpc.readProjectCommandTerminal(runId);
    if (!snapshot.ok) return;
    setRuns((current) =>
      current.map((run) =>
        run.id !== runId
          ? run
          : {
              ...run,
              status: snapshot.run.status,
              exitCode: snapshot.run.exitCode,
              endedAt: snapshot.run.endedAt,
              events: run.events.concat(snapshot.events),
              lastSeq: snapshot.events.length > 0 ? snapshot.events[snapshot.events.length - 1].seq : run.lastSeq,
            },
      ),
    );
  };

  const closeTab = async (runId: string) => {
    const run = runs.find((entry) => entry.id === runId);
    if (run?.status === "running") {
      await stopRun(runId);
    }
    setRuns((current) => current.filter((entry) => entry.id !== runId));
    setActiveRunId((current) => (current === runId ? null : current));
  };

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="project-terminal-sheet-backdrop"
      onClick={handleBackdropClick}
    >
      <div
        className="project-terminal-sheet"
        role="dialog"
        aria-modal="true"
      >
        <div className="project-terminal-header">
          <div>
            <div className="extension-modal-title">Project terminal</div>
            <div className="project-terminal-subtitle">Detected type: {projectType}</div>
          </div>
          <button type="button" className="sidebar-icon-button" onClick={onClose} aria-label="Close terminal">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="project-terminal-toolbar project-terminal-toolbar-stack">
          <div className="project-terminal-toolbar-row">
            <select
              className="project-terminal-select"
              value={selectedCommandId}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSelectedCommandId(nextValue);
                const selectedCustom = customCommands.find((item) => `custom:${item.id}` === nextValue);
                if (selectedCustom) {
                  setCustomCommandText(selectedCustom.commandText);
                }
              }}
              disabled={loading}
            >
              {commands.length === 0 ? <option value="">No detected command</option> : null}
              {commands.map((command) => (
                <option key={command.id} value={command.id}>
                  {command.label}
                </option>
              ))}
              <option value="custom:new">Custom command...</option>
              {customCommands.length > 0 ? <option disabled>-- Recent custom commands --</option> : null}
              {customCommands.map((command) => (
                <option key={command.id} value={`custom:${command.id}`}>
                  {command.commandText}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startRun}
              disabled={!selectedCommandId || starting || (selectedCommandId === "custom:new" && !customCommandText.trim())}
            >
              <Play className="h-4 w-4" />
              {starting ? "Starting..." : "Run"}
            </Button>
          </div>
          {selectedCommandId.startsWith("custom:") || selectedCommandId === "custom:new" ? (
            <input
              type="text"
              className="project-terminal-custom-input"
              value={customCommandText}
              onChange={(event) => setCustomCommandText(event.target.value)}
              placeholder="Type a custom command, e.g. npm run dev"
            />
          ) : null}
        </div>

        <div className="project-terminal-command-meta">
          {loading
            ? "Detecting commands..."
            : selectedCommandId.startsWith("custom:") || selectedCommandId === "custom:new"
              ? "Custom project command"
              : commands.find((item) => item.id === selectedCommandId)?.source ?? ""}
        </div>

        <div className="project-terminal-tabs" role="tablist" aria-label="Project terminal tabs">
          {runs.length === 0 ? <div className="project-terminal-empty-tabs">No terminal started yet.</div> : null}
          {runs.map((run) => (
            <div key={run.id} className={`project-terminal-tab ${activeRun?.id === run.id ? "project-terminal-tab-active" : ""}`}>
              <button type="button" className="project-terminal-tab-button" onClick={() => setActiveRunId(run.id)}>
                <Terminal className="h-3.5 w-3.5" />
                <span>{run.commandLabel}</span>
                <span className={`project-terminal-status project-terminal-status-${run.status}`}>{run.status}</span>
              </button>
              <button type="button" className="project-terminal-tab-close" onClick={() => void closeTab(run.id)} aria-label={`Close ${run.commandLabel}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="project-terminal-body">
          {activeRun ? (
            <>
              <div className="project-terminal-runbar">
                <code>{activeRun.commandPreview}</code>
                {activeRun.status === "running" ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void stopRun(activeRun.id)}>
                    <Square className="h-4 w-4" />
                    Stop
                  </Button>
                ) : null}
              </div>
              <pre className={`chat-tool-code project-terminal-output ${activeRun.status === "failed" ? "project-terminal-output-error" : ""}`}>
                {activeRunText || "Waiting for output..."}
              </pre>
            </>
          ) : (
            <div className="project-terminal-empty">Pick a command and run it to open a terminal tab.</div>
          )}
        </div>
      </div>
    </div>
  );
}
