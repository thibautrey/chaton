import { Gauge, Puzzle, Search, Settings, Workflow } from 'lucide-react'

import { ConversationRow } from '@/components/sidebar/ConversationRow'
import { SettingsSidebar } from '@/components/sidebar/settings/SettingsSidebar'
import { SidebarHeaderActions } from '@/components/sidebar/SidebarHeaderActions'
import { ProjectGroup } from '@/components/sidebar/ProjectGroup'
import { ChannelsNavItem } from '@/components/sidebar/ChannelsNavItem'
import { UpdateButton } from '@/components/sidebar/UpdateButton'
import { ChangelogCard } from '@/components/sidebar/ChangelogCard'
import { useChangelogManager } from '@/components/ChangelogManager'
import { useWorkspace } from '@/features/workspace/store'
import { selectGlobalConversations, selectVisibleConversations } from '@/features/workspace/selectors'
import { useTranslation } from 'react-i18next'

export function Sidebar({ width }: { width: number }) {
  const { t } = useTranslation()
  const { showChangelogForVersion } = useChangelogManager()
  const { state, selectConversation, setSearchQuery, deleteConversation, openSettings, openAutomations, openSkills, openExtensions, openChannels, startGlobalConversationDraft, createConversationGlobal } = useWorkspace()

  const visibleConversations = selectVisibleConversations(state.conversations, state.settings)
  const globalConversations = selectGlobalConversations(state.conversations, state.settings)

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
        <UpdateButton />
        <button
          type="button"
          className="sidebar-item"
          onClick={() => {
            startGlobalConversationDraft()
            void createConversationGlobal()
          }}
        >
          {t('Nouveau fil')}
        </button>
        <button
          type="button"
          className={`sidebar-item ${state.sidebarMode === 'extension-main-view' && state.activeExtensionViewId === 'automation.main' ? 'sidebar-item-active' : ''}`}
          onClick={openAutomations}
        >
          <Gauge className="sidebar-nav-icon h-4 w-4" />
          {'Automatisations'}
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
        <ChannelsNavItem
          active={state.sidebarMode === 'channels' || state.sidebarMode === 'extension-main-view'}
          onClick={openChannels}
        />
      </nav>

      <div className="sidebar-section-head">
        <span className="sidebar-section-title">{t('Fils')}</span>
        <SidebarHeaderActions />
      </div>

      {state.settings.isSearchVisible ? (
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
      ) : null}

      <div className="sidebar-scroll">
        {state.settings.organizeBy === 'chronological' ? (
          <section aria-label={t('Liste chronologique')} role="list" className="sidebar-thread-list">
          {visibleConversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              isActive={state.selectedConversationId === conversation.id}
              hasRunningAction={
                (state.piByConversation[conversation.id]?.status === 'streaming') ||
                ((state.piByConversation[conversation.id]?.pendingCommands ?? 0) > 0) ||
                !!state.piByConversation[conversation.id]?.pendingUserMessage
              }
              hasCompletedAction={!!state.completedActionByConversation[conversation.id]}
              onSelect={selectConversation}
              onDelete={deleteConversation}
            />
          ))}
          </section>
        ) : (
          <>
            <section aria-label="Threads globaux" role="list" className="sidebar-thread-list">
              {globalConversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  isActive={state.selectedConversationId === conversation.id}
                  hasRunningAction={
                    (state.piByConversation[conversation.id]?.status === 'streaming') ||
                    ((state.piByConversation[conversation.id]?.pendingCommands ?? 0) > 0) ||
                    !!state.piByConversation[conversation.id]?.pendingUserMessage
                  }
                  hasCompletedAction={!!state.completedActionByConversation[conversation.id]}
                  onSelect={selectConversation}
                  onDelete={deleteConversation}
                />
              ))}
            </section>
            {state.projects.map((project) => <ProjectGroup key={project.id} project={project} />)}
          </>
        )}
      </div>

      <div className="border-t border-[#dcdddf] px-3 py-3">
        <button type="button" className="sidebar-item text-[#45464d]" onClick={openSettings}>
          <Settings className="h-4 w-4" />
          {t('Paramètres')}
        </button>
      </div>
      <ChangelogCard
        version={import.meta.env.VITE_APP_VERSION || '0.1.0'}
        onClick={() => {
          showChangelogForVersion(import.meta.env.VITE_APP_VERSION || '0.1.0')
        }}
      />
    </aside>
  )
}
