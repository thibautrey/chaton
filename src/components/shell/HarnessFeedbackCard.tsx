import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/features/workspace/store/provider'
import type { Conversation } from '@/features/workspace/types'
import { usePiRuntimeMeta } from '@/features/workspace/store/pi-store'

function formatDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

type HarnessFeedbackCardProps = {
  conversation: Conversation
}

export function HarnessFeedbackCard({ conversation }: HarnessFeedbackCardProps) {
  const { getConversationHarnessFeedback, setConversationHarnessFeedback } = useWorkspace()
  const runtime = usePiRuntimeMeta(conversation.id)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{
    conversationId: string
    harnessCandidateId: string | null
    harnessSnapshot: Record<string, unknown> | null
    enabled: boolean
    userRating: -1 | 1 | null
    userFeedbackSubmittedAt: string | null
    createdAt: string
    updatedAt: string
  } | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    void getConversationHarnessFeedback(conversation.id)
      .then((next) => {
        if (!cancelled) {
          setFeedback(next)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [conversation.id, getConversationHarnessFeedback])

  const harness = useMemo(() => {
    const runtimeHarness = runtime?.state?.harness ?? null
    if (feedback?.harnessSnapshot) {
      return feedback.harnessSnapshot
    }
    if (runtimeHarness?.candidate && typeof runtimeHarness.candidate === 'object') {
      return runtimeHarness.candidate
    }
    return null
  }, [feedback?.harnessSnapshot, runtime?.state?.harness])

  const effectiveEnabled = feedback?.enabled ?? conversation.harnessEnabled ?? false
  const effectiveCandidateId = feedback?.harnessCandidateId ?? conversation.harnessCandidateId ?? runtime?.state?.harness?.candidateId ?? null
  const effectiveRating = feedback?.userRating ?? conversation.harnessUserRating ?? runtime?.state?.harness?.userRating ?? null
  const hasAssistantReply = useMemo(() => {
    return conversation.lastMessageAt !== conversation.createdAt
  }, [conversation.createdAt, conversation.lastMessageAt])

  const submitRating = async (rating: -1 | 1) => {
    setIsSubmitting(true)
    try {
      const next = await setConversationHarnessFeedback(conversation.id, {
        enabled: effectiveEnabled,
        userRating: effectiveRating === rating ? null : rating,
      })
      setFeedback(next)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!effectiveEnabled && !harness && !effectiveCandidateId) {
    return null
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Hybrid harness feedback
          </div>
          <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            Harness {effectiveCandidateId ?? 'baseline'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Votre avis est conservé et réutilisé par l'optimizer pour pondérer les variantes futures.
          </div>
          {feedback?.userFeedbackSubmittedAt ? (
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Dernier vote: {formatDate(feedback.userFeedbackSubmittedAt)}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            variant={effectiveRating === 1 ? 'default' : 'outline'}
            size="sm"
            onClick={() => void submitRating(1)}
            disabled={isSubmitting || isLoading || !hasAssistantReply}
          >
            <ThumbsUp className="h-4 w-4" />
            Utile
          </Button>
          <Button
            variant={effectiveRating === -1 ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => void submitRating(-1)}
            disabled={isSubmitting || isLoading || !hasAssistantReply}
          >
            <ThumbsDown className="h-4 w-4" />
            Pas utile
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded((value) => !value)}>
            {isExpanded ? 'Masquer' : 'Voir le harness'}
          </Button>
        </div>
      </div>
      {isExpanded && harness ? (
        <pre className="mt-3 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">{JSON.stringify(harness, null, 2)}</pre>
      ) : null}
    </section>
  )
}
