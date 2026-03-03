import { ChevronDown, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWorkspace } from '@/features/workspace/store'

function StatusButton({ label, warning = false }: { label: string; warning?: boolean }) {
  return (
    <button type="button" className={`status-button ${warning ? 'status-button-warning' : ''}`}>
      <span>{label}</span>
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  )
}

export function Composer() {
  const { state, setNotice } = useWorkspace()
  const selectedConversation = state.conversations.find((conversation) => conversation.id === state.selectedConversationId)

  return (
    <footer className="composer-footer">
      <div className="content-wrap">
        {state.notice ? (
          <div className="app-notice" role="status" onClick={() => setNotice(null)}>
            {state.notice}
          </div>
        ) : null}

        <div className="composer-shell">
          <Input
            placeholder={
              selectedConversation
                ? `Répondre dans « ${selectedConversation.title} »`
                : 'Sélectionnez un fil pour commencer'
            }
            className="composer-input"
          />

          <div className="composer-meta">
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-[#696b73]">
                <Plus className="h-4 w-4" />
              </Button>
              <Badge variant="secondary" className="meta-chip">
                GPT-5.3-Codex <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Badge>
            </div>

            <Button type="button" size="icon" className="send-button">
              <ChevronDown className="h-4 w-4 rotate-180" />
            </Button>
          </div>
        </div>

        <div className="status-row">
          <StatusButton label="▭ Local" />
          <StatusButton label="◌ Accès complet" warning />
          <StatusButton label="⌘ main" />
        </div>
      </div>
    </footer>
  )
}
