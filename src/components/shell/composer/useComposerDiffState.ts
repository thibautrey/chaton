import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { workspaceIpc } from "@/services/ipc/workspace";

import { computeThreadDeltaFiles, computeTotals, toStatByPath } from "./git";
import type {
  FileDiffDetails,
  ModifiedFileStat,
  ModifiedFileStatByPath,
} from "./types";

type ModificationTotals = {
  files: number;
  added: number;
  removed: number;
};

type UseComposerDiffStateArgs = {
  composerKey: string;
  selectedConversationId: string | null;
  isWorkingOnChanges: boolean;
};

type UseComposerDiffStateResult = {
  gitModifiedFiles: ModifiedFileStat[];
  gitModificationTotals: ModificationTotals;
  showModificationsPanel: boolean;
  showModificationsList: boolean;
  hasInlineDiffOpen: boolean;
  openDiffPaths: Record<string, boolean>;
  diffLoadingByPath: Record<string, boolean>;
  diffErrorByPath: Record<string, string | null>;
  diffByPath: Record<string, FileDiffDetails>;
  currentChangeIndexByPath: Record<string, number>;
  ensureGitBaselineForConversation: (conversationId: string) => Promise<void>;
  toggleModificationsPanel: () => void;
  handleToggleDiffForFile: (path: string) => void;
  scrollToChange: (path: string, index: number) => void;
  setDiffLineContainerRef: (path: string, element: HTMLDivElement | null) => void;
  setFirstDiffChangeRef: (path: string, element: HTMLDivElement | null) => void;
  setDiffChangeRef: (
    path: string,
    index: number,
    element: HTMLDivElement | null,
  ) => void;
};

export function useComposerDiffState({
  composerKey,
  selectedConversationId,
  isWorkingOnChanges,
}: UseComposerDiffStateArgs): UseComposerDiffStateResult {
  const [isModificationsExpandedByKey, setIsModificationsExpandedByKey] =
    useState<Record<string, boolean>>({});
  const [gitModifiedFiles, setGitModifiedFiles] = useState<ModifiedFileStat[]>([]);
  const [gitBaselineByConversationId, setGitBaselineByConversationId] =
    useState<Record<string, ModifiedFileStatByPath>>({});
  const [gitModificationTotals, setGitModificationTotals] =
    useState<ModificationTotals>({
      files: 0,
      added: 0,
      removed: 0,
    });
  const [openDiffPathsByKey, setOpenDiffPathsByKey] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [diffByPathByKey, setDiffByPathByKey] = useState<
    Record<string, Record<string, FileDiffDetails>>
  >({});
  const [diffLoadingByPathByKey, setDiffLoadingByPathByKey] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [diffErrorByPathByKey, setDiffErrorByPathByKey] = useState<
    Record<string, Record<string, string | null>>
  >({});
  const [currentChangeIndexByPathByKey, setCurrentChangeIndexByPathByKey] =
    useState<Record<string, Record<string, number>>>({});

  const gitBaselineByConversationIdRef = useRef(gitBaselineByConversationId);
  const diffFirstChangeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const diffChangeRefs = useRef<Record<string, Array<HTMLDivElement | null>>>({});
  const diffLinesContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    gitBaselineByConversationIdRef.current = gitBaselineByConversationId;
  }, [gitBaselineByConversationId]);

  const openDiffPaths = useMemo(
    () => openDiffPathsByKey[composerKey] ?? {},
    [openDiffPathsByKey, composerKey],
  );
  const diffByPath = useMemo(
    () => diffByPathByKey[composerKey] ?? {},
    [diffByPathByKey, composerKey],
  );
  const diffLoadingByPath = useMemo(
    () => diffLoadingByPathByKey[composerKey] ?? {},
    [diffLoadingByPathByKey, composerKey],
  );
  const diffErrorByPath = useMemo(
    () => diffErrorByPathByKey[composerKey] ?? {},
    [diffErrorByPathByKey, composerKey],
  );
  const currentChangeIndexByPath = useMemo(
    () => currentChangeIndexByPathByKey[composerKey] ?? {},
    [currentChangeIndexByPathByKey, composerKey],
  );
  const hasInlineDiffOpen = Object.values(openDiffPaths).some(Boolean);
  const showModificationsPanel = Boolean(
    selectedConversationId && gitModifiedFiles.length > 0,
  );
  const showModificationsList =
    isModificationsExpandedByKey[composerKey] ?? false;

  const ensureGitBaselineForConversation = useCallback(
    async (conversationId: string) => {
      if (gitBaselineByConversationIdRef.current[conversationId]) {
        return;
      }
      const result = await workspaceIpc.getGitDiffSummary(conversationId);
      const baseline = result.ok ? toStatByPath(result.files) : {};
      setGitBaselineByConversationId((previous) => {
        if (previous[conversationId]) {
          return previous;
        }
        return {
          ...previous,
          [conversationId]: baseline,
        };
      });
    },
    [],
  );

  useEffect(() => {
    let isCancelled = false;

    if (!selectedConversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGitModifiedFiles((previous) => (previous.length === 0 ? previous : []));
       
      setGitModificationTotals((previous) =>
        previous.files === 0 && previous.added === 0 && previous.removed === 0
          ? previous
          : { files: 0, added: 0, removed: 0 },
      );
      return;
    }

    const baseline = gitBaselineByConversationId[selectedConversationId];
    if (!baseline) {
       
      setGitModifiedFiles((previous) => (previous.length === 0 ? previous : []));
       
      setGitModificationTotals((previous) =>
        previous.files === 0 && previous.added === 0 && previous.removed === 0
          ? previous
          : { files: 0, added: 0, removed: 0 },
      );
      return;
    }

    const key = composerKey;

    const refresh = async () => {
      const result = await workspaceIpc.getGitDiffSummary(selectedConversationId);
      if (isCancelled) {
        return;
      }
      if (!result.ok) {
        setGitModifiedFiles([]);
        setGitModificationTotals({ files: 0, added: 0, removed: 0 });
        return;
      }

      const threadFiles = computeThreadDeltaFiles(result.files, baseline);
      setGitModifiedFiles(threadFiles);
      setGitModificationTotals(computeTotals(threadFiles));

      const pruneByThreadFiles = <T,>(
        previous: Record<string, Record<string, T>>,
      ): Record<string, Record<string, T>> => {
        const scoped = previous[key];
        if (!scoped) {
          return previous;
        }
        const nextScoped: Record<string, T> = {};
        for (const file of threadFiles) {
          if (scoped[file.path] !== undefined) {
            nextScoped[file.path] = scoped[file.path];
          }
        }
        return { ...previous, [key]: nextScoped };
      };

      setDiffByPathByKey(pruneByThreadFiles);
      setDiffLoadingByPathByKey(pruneByThreadFiles);
      setDiffErrorByPathByKey(pruneByThreadFiles);
      setOpenDiffPathsByKey(pruneByThreadFiles);
      setCurrentChangeIndexByPathByKey(pruneByThreadFiles);
    };

    void refresh();
    const timer = window.setInterval(
      () => {
        void refresh();
      },
      isWorkingOnChanges ? 1500 : 5000,
    );

    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [
    composerKey,
    gitBaselineByConversationId,
    isWorkingOnChanges,
    selectedConversationId,
  ]);

  useEffect(() => {
    for (const path of Object.keys(openDiffPaths)) {
      if (!openDiffPaths[path]) {
        continue;
      }
      const element = diffFirstChangeRefs.current[path];
      if (element) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [diffByPath, openDiffPaths]);

  const setScopedBooleanState = useCallback(
    (
      setter: Dispatch<SetStateAction<Record<string, Record<string, boolean>>>>,
      path: string,
      value: boolean,
    ) => {
      setter((previous) => ({
        ...previous,
        [composerKey]: { ...(previous[composerKey] ?? {}), [path]: value },
      }));
    },
    [composerKey],
  );

  const setScopedNullableStringState = useCallback(
    (
      setter: Dispatch<
        SetStateAction<Record<string, Record<string, string | null>>>
      >,
      path: string,
      value: string | null,
    ) => {
      setter((previous) => ({
        ...previous,
        [composerKey]: { ...(previous[composerKey] ?? {}), [path]: value },
      }));
    },
    [composerKey],
  );

  const setScopedDiffState = useCallback(
    (
      setter: Dispatch<
        SetStateAction<Record<string, Record<string, FileDiffDetails>>>
      >,
      path: string,
      value: FileDiffDetails,
    ) => {
      setter((previous) => ({
        ...previous,
        [composerKey]: { ...(previous[composerKey] ?? {}), [path]: value },
      }));
    },
    [composerKey],
  );

  const loadDiffForFile = useCallback(
    async (path: string) => {
      if (!selectedConversationId) {
        return;
      }
      setScopedBooleanState(setDiffLoadingByPathByKey, path, true);
      setScopedNullableStringState(setDiffErrorByPathByKey, path, null);
      const result = await workspaceIpc.getGitFileDiff(selectedConversationId, path);
      if (!result.ok) {
        setScopedBooleanState(setDiffLoadingByPathByKey, path, false);
        setScopedNullableStringState(
          setDiffErrorByPathByKey,
          path,
          result.message ?? "Impossible de charger le diff pour ce fichier.",
        );
        return;
      }
      setScopedDiffState(setDiffByPathByKey, path, {
        path: result.path,
        lines: result.diff.replace(/\r\n/g, "\n").split("\n"),
        firstChangedLine: result.firstChangedLine,
        isBinary: result.isBinary,
      });
      setScopedBooleanState(setDiffLoadingByPathByKey, path, false);
    },
    [
      selectedConversationId,
      setScopedBooleanState,
      setScopedDiffState,
      setScopedNullableStringState,
    ],
  );

  const handleToggleDiffForFile = useCallback(
    (path: string) => {
      setOpenDiffPathsByKey((previous) => ({
        ...previous,
        [composerKey]: {
          ...(previous[composerKey] ?? {}),
          [path]: !(previous[composerKey]?.[path] ?? false),
        },
      }));
      if (!diffByPath[path] && !diffLoadingByPath[path]) {
        void loadDiffForFile(path);
      }
    },
    [composerKey, diffByPath, diffLoadingByPath, loadDiffForFile],
  );

  const scrollToChange = useCallback(
    (path: string, index: number) => {
      const nodes = diffChangeRefs.current[path] ?? [];
      const clamped = Math.max(0, Math.min(index, nodes.length - 1));
      setCurrentChangeIndexByPathByKey((previous) => ({
        ...previous,
        [composerKey]: { ...(previous[composerKey] ?? {}), [path]: clamped },
      }));
      const target = nodes[clamped];
      if (!target) {
        return;
      }
      const container = diffLinesContainerRefs.current[path];
      if (container) {
        const targetTop =
          target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2;
        container.scrollTo({
          top: Math.max(0, targetTop),
          behavior: "smooth",
        });
        return;
      }
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [composerKey],
  );

  const toggleModificationsPanel = useCallback(() => {
    setIsModificationsExpandedByKey((previous) => ({
      ...previous,
      [composerKey]: !(previous[composerKey] ?? false),
    }));
  }, [composerKey]);

  const setDiffLineContainerRef = useCallback(
    (path: string, element: HTMLDivElement | null) => {
      diffLinesContainerRefs.current[path] = element;
    },
    [],
  );

  const setFirstDiffChangeRef = useCallback(
    (path: string, element: HTMLDivElement | null) => {
      diffFirstChangeRefs.current[path] = element;
    },
    [],
  );

  const setDiffChangeRef = useCallback(
    (path: string, index: number, element: HTMLDivElement | null) => {
      if (!diffChangeRefs.current[path]) {
        diffChangeRefs.current[path] = [];
      }
      diffChangeRefs.current[path][index] = element;
    },
    [],
  );

  return {
    gitModifiedFiles,
    gitModificationTotals,
    showModificationsPanel,
    showModificationsList,
    hasInlineDiffOpen,
    openDiffPaths,
    diffLoadingByPath,
    diffErrorByPath,
    diffByPath,
    currentChangeIndexByPath,
    ensureGitBaselineForConversation,
    toggleModificationsPanel,
    handleToggleDiffForFile,
    scrollToChange,
    setDiffLineContainerRef,
    setFirstDiffChangeRef,
    setDiffChangeRef,
  };
}
