import { useEffect, useState } from 'react'
import { ArrowLeft, Brain, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { workspaceIpc } from '@/services/ipc/workspace'
import { useWorkspace } from '@/features/workspace/store'

type MemoryEntry = {
  id: string
  title?: string
  content: string
  kind?: string
  tags?: string[]
  scope?: string
  createdAt?: string
  updatedAt?: string
}

export function AssistantMemoryView() {
  const { t } = useTranslation()
  const { setAssistantView } = useWorkspace()
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const loadMemories = async () => {
    setLoading(true)
    try {
      const result = await workspaceIpc.extensionHostCall(
        '@chaton/memory',
        'memory.list',
        { scope: 'all', limit: 50 },
      )
      if (result.ok && result.data) {
        const data = result.data as { entries?: MemoryEntry[] }
        setMemories(data.entries ?? [])
      }
    } catch {
      // Extension not available
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadMemories() }, [])

  const handleDelete = async (id: string) => {
    try {
      await workspaceIpc.extensionHostCall('@chaton/memory', 'memory.delete', { id })
      setMemories((prev) => prev.filter((m) => m.id !== id))
    } catch {
      // Ignore
    }
  }

  return (
    <div className="ad-subview">
      <div className="ad-subview-header">
        <button type="button" className="ad-back-btn" onClick={() => setAssistantView('home')}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Brain className="ad-subview-icon h-5 w-5" />
        <h1 className="ad-subview-title">{t('assistant.memory.title')}</h1>
      </div>
      <p className="ad-subview-desc">{t('assistant.memory.desc')}</p>

      <div className="ad-subview-scroll">
        {loading ? (
          <div className="ad-card-loading">{t('assistant.dashboard.loading')}</div>
        ) : memories.length === 0 ? (
          <div className="ad-card-empty">
            <Brain className="h-8 w-8 text-[#b0b5c0] dark:text-[#5a6580]" />
            <p>{t('assistant.memory.empty')}</p>
            <p className="ad-card-hint">{t('assistant.memory.emptyHint')}</p>
          </div>
        ) : (
          <div className="ad-memory-full-list">
            {memories.map((memory) => (
              <div key={memory.id} className="ad-memory-full-row">
                <div className="ad-memory-full-content">
                  {memory.title && (
                    <div className="ad-memory-full-title">{memory.title}</div>
                  )}
                  <div className="ad-memory-full-text">{memory.content}</div>
                  <div className="ad-memory-full-meta">
                    {memory.kind && <span className="ad-memory-tag">{memory.kind}</span>}
                    {memory.scope && <span className="ad-memory-tag">{memory.scope}</span>}
                    {(memory.tags ?? []).map((tag) => (
                      <span key={tag} className="ad-memory-tag">{tag}</span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="ad-memory-delete"
                  onClick={() => void handleDelete(memory.id)}
                  title={t('assistant.memory.delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
