import { Gauge, Search, Settings, Workflow } from 'lucide-react'

import { SidebarHeaderActions } from '@/components/sidebar/SidebarHeaderActions'
import { ProjectGroup } from '@/components/sidebar/ProjectGroup'
import { useWorkspace } from '@/features/workspace/store'
import { selectVisibleConversations } from '@/features/workspace/selectors'

export function Sidebar({ width }: { width: number }) {
  const { state, setSearchQuery } = useWorkspace()

  const visibleConversations = selectVisibleConversations(state.conversations, state.settings)

  return (
    <aside className="sidebar-panel" style={{ width: `${width}px` }}>
      <nav className="sidebar-nav" aria-label="Navigation principale">
        <button type="button" className="sidebar-item">
          <Gauge className="h-4 w-4 text-[#66676f]" />
          Automatisations
        </button>
        <button type="button" className="sidebar-item">
          <Workflow className="h-4 w-4 text-[#66676f]" />
          Compétences
        </button>
      </nav>

      <div className="sidebar-section-head">
        <span className="sidebar-section-title">Fils</span>
        <SidebarHeaderActions />
      </div>

      <div className="px-3 pb-2">
        <label htmlFor="sidebar-search" className="sr-only">
          Rechercher un fil
        </label>
        <div className="sidebar-search-wrap">
          <Search className="h-4 w-4 text-[#8d8e95]" />
          <input
            id="sidebar-search"
            className="sidebar-search-input"
            value={state.settings.searchQuery}
            onChange={(event) => {
              void setSearchQuery(event.target.value)
            }}
            placeholder="Filtrer les fils"
          />
        </div>
      </div>

      <div className="sidebar-scroll">
        {state.settings.organizeBy === 'chronological' ? (
          <section aria-label="Liste chronologique" role="list" className="sidebar-thread-list">
            {visibleConversations.map((conversation) => (
              <button key={conversation.id} type="button" className="thread-row">
                <span className="thread-row-title">{conversation.title}</span>
              </button>
            ))}
          </section>
        ) : (
          state.projects.map((project) => <ProjectGroup key={project.id} project={project} />)
        )}
      </div>

      <div className="border-t border-[#dcdddf] px-3 py-3">
        <button type="button" className="sidebar-item text-[#45464d]">
          <Settings className="h-4 w-4" />
          Paramètres
        </button>
      </div>
    </aside>
  )
}
