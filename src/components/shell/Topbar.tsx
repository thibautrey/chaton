import { CircleDashed, Command, MessageSquarePlus, PanelRightOpen, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/features/workspace/store'

function TopPill({ label }: { label: string }) {
  return (
    <Button type="button" variant="outline" className="top-pill top-pill-default">
      <span>{label}</span>
    </Button>
  )
}

function IconBtn({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="icon-button">
      <Icon className="h-4 w-4" />
    </Button>
  )
}

export function Topbar() {
  const { state } = useWorkspace()

  const selectedConversation = state.conversations.find((conversation) => conversation.id === state.selectedConversationId)

  return (
    <header className="topbar">
      <div className="topbar-title">{selectedConversation?.title ?? 'Nouveau fil'}</div>

      <div className="flex items-center gap-2">
        <TopPill label="Ouvrir" />
        <TopPill label="Validation" />
        <IconBtn icon={Command} />
        <IconBtn icon={CircleDashed} />
        <IconBtn icon={PanelRightOpen} />
        <IconBtn icon={MessageSquarePlus} />
        <IconBtn icon={Pencil} />
      </div>
    </header>
  )
}
