import { useMemo, useState } from 'react'

import type { Conversation } from '@/features/workspace/types'
import { useWorkspace } from '@/features/workspace/store'
import { usePiRuntimeMeta } from '@/features/workspace/store/pi-store'

function getHarnessCandidate(
  conversation: Conversation,
  runtimeHarness: Record<string, unknown> | null | undefined,
) {
  if (runtimeHarness && typeof runtimeHarness.candidateId === 'string' && runtimeHarness.candidateId.trim().length > 0) {
    return runtimeHarness.candidateId
  }
  if (conversation.harnessCandidateId && conversation.harnessCandidateId.trim().length > 0) {
    return conversation.harnessCandidateId
  }
  return null
}

type HarnessBadgeProps = {
  conversation: Conversation | undefined
}

export function HarnessBadge({ conversation }: HarnessBadgeProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { state } = useWorkspace()
  const runtime = usePiRuntimeMeta(conversation?.id ?? null)

  const badge = useMemo(() => {
    if (!conversation || !state.settings.enableHarnessUI) return null
    const runtimeHarness = runtime?.state?.harness as Record<string, unknown> | null | undefined
    const enabled = Boolean(conversation.harnessEnabled ?? runtimeHarness?.enabled)
    if (!enabled) return null
    const candidateId = getHarnessCandidate(conversation, runtimeHarness)
    const candidate = runtimeHarness?.candidate && typeof runtimeHarness.candidate === 'object'
      ? (runtimeHarness.candidate as Record<string, unknown>)
      : null
    return { candidateId, candidate }
  }, [conversation, runtime?.state?.harness, state.settings.enableHarnessUI])

  if (!badge || !conversation) {
    return null
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-full border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
        onClick={() => setIsOpen((value) => !value)}
      >
        Harness: {badge.candidateId ?? 'baseline'}
      </button>
      {isOpen ? (
        <div className="absolute left-0 top-full z-20 mt-2 w-[420px] max-w-[min(80vw,420px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Harness actif
          </div>
          <div className="mb-2 text-sm font-medium text-slate-900 dark:text-slate-100">
            {badge.candidateId ?? 'baseline'}
          </div>
          <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-800 dark:bg-slate-900 dark:text-slate-200">{JSON.stringify(badge.candidate ?? { id: badge.candidateId ?? 'baseline' }, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  )
}
