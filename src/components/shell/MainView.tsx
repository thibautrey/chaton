import { Sparkles } from 'lucide-react'

import { useWorkspace } from '@/features/workspace/store'

export function MainView() {
  const { state } = useWorkspace()
  const selectedConversation = state.conversations.find((conversation) => conversation.id === state.selectedConversationId)
  const selectedProject = state.projects.find((project) => project.id === state.selectedProjectId)

  return (
    <div className="main-scroll">
      <section className="hero-section">
        <div className="hero-group">
          <div className="hero-icon-wrap">
            <Sparkles className="h-5 w-5 text-[#17181d]" />
          </div>
          <h1 className="hero-title">{selectedConversation?.title ?? 'Sélectionnez un fil'}</h1>
          <div className="hero-subtitle">{selectedProject?.name ?? 'Aucun projet sélectionné'}</div>
        </div>
      </section>
    </div>
  )
}
