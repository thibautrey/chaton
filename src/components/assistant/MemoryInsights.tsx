import { useEffect, useState } from 'react'
import { Brain, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { workspaceIpc } from '@/services/ipc/workspace'
import { useWorkspace } from '@/features/workspace/store'

type MemoryEntry = {
  id: string
  title?: string
  content: string
  kind?: string
  tags?: string[]
  createdAt?: string
}

export function MemoryInsights() {
  const { t } = useTranslation()
  const { setAssistantView } = useWorkspace()
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      try {
        // Query memory extension KV to get stored memories
        const result = await workspaceIpc.extensionHostCall(
          '@chaton/memory',
          'memory.list',
          { scope: 'global', limit: 5 },
        )

        if (cancelled) return

        if (result.ok && result.data) {
          const data = result.data as { entries?: MemoryEntry[]; total?: number }
          setMemories(data.entries ?? [])
          setTotalCount(data.total ?? data.entries?.length ?? 0)
        }
      } catch {
        // Memory extension may not be installed
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  return (
    <section className="ad-card">
      <div className="ad-card-header">
        <Brain className="ad-card-icon h-4 w-4" />
        <h2 className="ad-card-title">{t('assistant.dashboard.memory')}</h2>
        {totalCount > 0 && (
          <span className="ad-card-badge">{totalCount}</span>
        )}
      </div>

      {loading ? (
        <div className="ad-card-loading">{t('assistant.dashboard.loading')}</div>
      ) : memories.length === 0 ? (
        <div className="ad-card-empty">
          <p>{t('assistant.dashboard.noMemories')}</p>
          <p className="ad-card-hint">{t('assistant.dashboard.memoryHint')}</p>
        </div>
      ) : (
        <>
          <div className="ad-memory-list">
            {memories.map((memory) => (
              <div key={memory.id} className="ad-memory-row">
                <span className="ad-memory-pin">&#128204;</span>
                <span className="ad-memory-text">
                  {memory.title || memory.content.slice(0, 80)}
                </span>
              </div>
            ))}
          </div>
          {totalCount > 5 && (
            <button
              type="button"
              className="ad-card-link"
              onClick={() => setAssistantView('memory')}
            >
              {t('assistant.dashboard.viewAll')}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </section>
  )
}
