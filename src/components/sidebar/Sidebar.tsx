import { Plus, Puzzle, Search, Settings, Workflow } from 'lucide-react'

import { ConversationRow } from '@/components/sidebar/ConversationRow'
import { SettingsSidebar } from '@/components/sidebar/settings/SettingsSidebar'
import { SidebarHeaderActions } from '@/components/sidebar/SidebarHeaderActions'
import { SidebarModeSwitcher } from '@/components/sidebar/SidebarModeSwitcher'
import { ProjectGroup } from '@/components/sidebar/ProjectGroup'
import { ChannelsNavItem } from '@/components/sidebar/ChannelsNavItem'
import { UpdateButton } from '@/components/sidebar/UpdateButton'
import { ChangelogCard } from '@/components/sidebar/ChangelogCard'
import { ExtensionSidebarItems } from '@/components/sidebar/ExtensionSidebarItems'
import { useChangelogManager } from '@/components/ChangelogManager'
import { useWorkspace } from '@/features/workspace/store'
import { selectGlobalConversations, selectVisibleConversations } from '@/features/workspace/selectors'
import { useTranslation } from 'react-i18next'
import { useMemo, useEffect, useState } from 'react'
import { workspaceIpc } from '@/services/ipc/workspace'
import type { ChatonsExtension } from '@/features/workspace/types'
import { perfMonitor } from '@/features/workspace/store/perf-monitor'

export function Sidebar({ width }: { width: number }) {
  perfMonitor.recordComponentRender('Sidebar')
  const { t } = useTranslation()
  const { showChangelogForVersion } = useChangelogManager()
  const { state, selectConversation, setSearchQuery, deleteConversation, openSettings, openSkills, openExtensions, openChannels, createConversationGlobal } = useWorkspace()
  const [extensions, setExtensions] = useState<ChatonsExtension[]>([])

  const visibleConversations = selectVisibleConversations(state.conversations, state.settings)
  const globalConversations = selectGlobalConversations(state.conversations, state.settings)

  useEffect(() => {
    const loadExtensions = async () => {
      try {
        const result = await workspaceIpc.listExtensions()
        if (result.ok) {
          setExtensions(result.extensions)
        }
      } catch (error) {
        console.error('Failed to load extensions:', error)
      }
    }
    
    void loadExtensions()
  }, [])

  // Memoize extensions transformation to avoid creating new arrays on every render
  // This prevents O(n²) complexity when rendering projects with extensions
  const extensionsData = useMemo(() => 
    extensions.map(ext => ({ id: ext.id, icon: ext.config?.icon, iconUrl: ext.config?.iconUrl })),
    [extensions]
  )

  if (state.sidebarMode === 'settings') {
    return (
      <aside className="sidebar-panel" style={{ width: `${width}px` }}>
        <SettingsSidebar />
      </aside>
    )
  }

  return (
    <aside className="sidebar-panel" style={{ width: `${width}px` }}>
      {state.appMode === 'workspace' ? (
        <>
          <nav className="sidebar-nav pt-4" aria-label={t('Navigation principale')}>
            <UpdateButton />
            <button
              type="button"
              className="sidebar-item"
              onClick={() => {
                void createConversationGlobal()
              }}
            >
              <Plus className="sidebar-nav-icon h-4 w-4" />
              {t('Nouvelle conversation')}
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
              {state.extensionUpdatesCount > 0 && (
                <span className="sidebar-badge">{state.extensionUpdatesCount}</span>
              )}
            </button>
            <ChannelsNavItem
              active={state.sidebarMode === 'channels'}
              onClick={openChannels}
            />
            <ExtensionSidebarItems />
          </nav>

          <div className="sidebar-section-head">
            <span className="sidebar-section-title">{t('Conversations')}</span>
            <SidebarHeaderActions />
          </div>

          {state.settings.isSearchVisible ? (
            <div className="px-3 pb-2">
              <label htmlFor="sidebar-search" className="sr-only">
                {t('Rechercher une conversation')}
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
                  placeholder={t('Filtrer les conversations')}
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
                  onSelect={selectConversation}
                  onDelete={deleteConversation}
                  extensions={extensionsData}
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
                      onSelect={selectConversation}
                      onDelete={deleteConversation}
                      extensions={extensionsData}
                    />
                  ))}
                </section>
                {state.projects.map((project) => <ProjectGroup key={project.id} project={project} extensions={extensionsData} />)}
              </>
            )}
          </div>
        </>
      ) : (
        // Assistant mode sidebar content
        <div className="sidebar-scroll" style={{ paddingTop: '1.5rem' }}>
          <nav className="sidebar-nav" aria-label={t('Navigation assistant')}>
            <div className="px-2.5 pb-3">
              <div className="text-sm font-semibold text-[#25262d] dark:text-[#e7e9ef]">
                {state.settings.assistantName || t('Assistant')}
              </div>
              {state.settings.assistantUserName ? (
                <div className="mt-0.5 text-xs text-[#8d8e95] dark:text-[#6b7899]">
                  {t('pour')} {state.settings.assistantUserName}
                </div>
              ) : null}
            </div>
          </nav>
        </div>
      )}

      <div className="border-t border-[#dcdddf] dark:border-[#1e2634] px-3 py-3 space-y-2">
        <SidebarModeSwitcher />
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
