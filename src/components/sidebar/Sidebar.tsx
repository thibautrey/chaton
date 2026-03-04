import { Gauge, Puzzle, Search, Settings, Workflow } from 'lucide-react'

import { ConversationRow } from '@/components/sidebar/ConversationRow'
import { SettingsSidebar } from '@/components/sidebar/settings/SettingsSidebar'
import { SidebarHeaderActions } from '@/components/sidebar/SidebarHeaderActions'
import { ProjectGroup } from '@/components/sidebar/ProjectGroup'
import { useWorkspace } from '@/features/workspace/store'
import { selectVisibleConversations } from '@/features/workspace/selectors'
import { useTranslation } from 'react-i18next'

export function Sidebar({ width }: { width: number }) {
  const { t } = useTranslation()
  const { state, selectConversation, setSearchQuery, deleteConversation, openSettings, openSkills, openExtensions, closeSettings } = useWorkspace()

  const visibleConversations = selectVisibleConversations(state.conversations, state.settings)

  if (state.sidebarMode === 'settings') {
    return (
      <aside className="sidebar-panel" style={{ width: `${width}px` }}>
        <SettingsSidebar />
      </aside>
    )
  }

  return (
    <aside className="sidebar-panel" style={{ width: `${width}px` }}>
      <nav className="sidebar-nav pt-4" aria-label={t('Navigation principale')}>
        <button
          type="button"
          className={`sidebar-item ${state.sidebarMode === 'default' ? 'sidebar-item-active' : ''}`}
          onClick={closeSettings}
        >
          <Gauge className="sidebar-nav-icon h-4 w-4" />
          {t('Automatisations')}
        </button>
        <button
          type="button"
          className={`sidebar-item ${state.sidebarMode === 'skills' ? 'sidebar-item-active' : ''}`}
          onClick={openSkills}
        >
          <Workflow className="sidebar-nav-icon h-4 w-4" />
          {t('Compétences')}
        </button>
        <button
          type="button"
          className={`sidebar-item ${state.sidebarMode === 'extensions' ? 'sidebar-item-active' : ''}`}
          onClick={openExtensions}
        >
          <Puzzle className="sidebar-nav-icon h-4 w-4" />
          {t('Extensions')}
        </button>
      </nav>

      <div className="sidebar-section-head">
        <span className="sidebar-section-title">{t('Fils')}</span>
        <SidebarHeaderActions />
      </div>

      <div className="px-3 pb-2">
        <label htmlFor="sidebar-search" className="sr-only">
          {t('Rechercher un fil')}
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
            placeholder={t('Filtrer les fils')}
          />
        </div>
      </div>

      <div className="sidebar-scroll">
        {state.settings.organizeBy === 'chronological' ? (
          <section aria-label={t('Liste chronologique')} role="list" className="sidebar-thread-list">
          {visibleConversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              isActive={state.selectedConversationId === conversation.id}
              isStreaming={state.piByConversation[conversation.id]?.status === 'streaming'}
              onSelect={selectConversation}
              onDelete={deleteConversation}
            />
          ))}
          </section>
        ) : (
          state.projects.map((project) => <ProjectGroup key={project.id} project={project} />)
        )}
      </div>

      <div className="border-t border-[#dcdddf] px-3 py-3">
        <button type="button" className="sidebar-item text-[#45464d]" onClick={openSettings}>
          <Settings className="h-4 w-4" />
          {t('Paramètres')}
        </button>
      </div>
    </aside>
  )
}
