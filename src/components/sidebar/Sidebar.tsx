import { Brain, Home, MessageCircle, MessageSquareShare, Plus, Puzzle, Search, Settings, Workflow, Zap } from 'lucide-react'

import { ConversationRow } from '@/components/sidebar/ConversationRow'
import { SettingsSidebar } from '@/components/sidebar/settings/SettingsSidebar'
import { SidebarHeaderActions } from '@/components/sidebar/SidebarHeaderActions'
import { SidebarModeSwitcher } from '@/components/sidebar/SidebarModeSwitcher'
import { ProjectGroup } from '@/components/sidebar/ProjectGroup'
import { ProjectFolder } from '@/components/sidebar/ProjectFolder'
import { UpdateButton } from '@/components/sidebar/UpdateButton'
import { ChangelogCard } from '@/components/sidebar/ChangelogCard'
import { MenuRowWithExtensions } from '@/components/sidebar/MenuRowWithExtensions'
import { useSidebarMenuItems } from '@/components/sidebar/useSidebarMenuItems'
import { useChangelogManager } from '@/components/ChangelogManager'
import { useWorkspace } from '@/features/workspace/store'
import { selectGlobalConversations, selectVisibleConversations } from '@/features/workspace/selectors'
import { useProjectFolder } from '@/components/sidebar/useProjectFolder'
import { useTranslation } from 'react-i18next'
import { useMemo, useEffect, useState } from 'react'
import { ProjectDetailsSheet } from '@/components/sidebar/ProjectDetailsSheet'
import { workspaceIpc } from '@/services/ipc/workspace'
import type { Project, ChatonsExtension } from '@/features/workspace/types'
import { perfMonitor } from '@/features/workspace/store/perf-monitor'

export function Sidebar({ width }: { width: number }) {
  perfMonitor.recordComponentRender('Sidebar')
  const { t } = useTranslation()
  const { showChangelogForVersion } = useChangelogManager()
  const { state, selectConversation, setSearchQuery, deleteConversation, openSettings, openSkills, openExtensions, openChannels, createConversationGlobal, setAssistantView, setAppMode } = useWorkspace()
  const [extensions, setExtensions] = useState<ChatonsExtension[]>([])
  const [detailsProject, setDetailsProject] = useState<Project | null>(null)

  const handleProjectUpdated = (projectId: string, icon: string | null) => {
    setDetailsProject((current) => {
      if (!current || current.id !== projectId) return current
      return { ...current, icon }
    })
  }

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

  // Split projects into visible, auto-folded, and user subfolders
  const { visible: visibleProjects, autoFolded: autoFoldedProjects, subFolders } = useProjectFolder(
    state.projects,
    state.conversations,
    state.selectedProjectId,
    state.settings.projectSubFolders ?? [],
  )

  // Collect archived projects
  const archivedProjects = useMemo(() => 
    state.projects.filter(p => p.isArchived),
    [state.projects]
  )

  // Generate menu items for the top navigation
  const { foldableItems } = useSidebarMenuItems({
    sidebarMode: state.sidebarMode,
    extensionUpdatesCount: state.extensionUpdatesCount,
    onOpenSkills: openSkills,
    onOpenExtensions: openExtensions,
    onOpenChannels: openChannels,
    onOpenNewConversation: createConversationGlobal,
  })

  // Add icons to foldable items
  const foldableItemsWithIcons = useMemo(() =>
    foldableItems.map(item => {
      let icon: React.ReactNode = null
      switch (item.id) {
        case 'skills':
          icon = <Workflow className="h-4 w-4" />
          break
        case 'extensions':
          icon = <Puzzle className="h-4 w-4" />
          break
        case 'channels':
          icon = <MessageSquareShare className="h-4 w-4" />
          break
      }
      return { ...item, icon }
    }),
    [foldableItems]
  )

  if (state.sidebarMode === 'settings') {
    return (
      <aside className="sidebar-panel" style={{ width: `${width}px` }}>
        <SettingsSidebar />
      </aside>
    )
  }

  return (
    <>
      <aside className="sidebar-panel" style={{ width: `${width}px` }}>
      {state.appMode === 'workspace' ? (
        <>
          <nav className="sidebar-nav pt-4" aria-label={t('Navigation principale')}>
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
          </nav>

          <nav className="sidebar-nav px-3 pb-2" aria-label={t('Menus supplémentaires')}>
            <MenuRowWithExtensions items={foldableItemsWithIcons} />
          </nav>

          <SidebarHeaderActions />

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
                {visibleProjects.map((project) => (
                  <ProjectGroup
                    key={project.id}
                    project={project}
                    extensions={extensionsData}
                    onOpenDetails={setDetailsProject}
                  />
                ))}
                {(autoFoldedProjects.length > 0 || subFolders.length > 0 || archivedProjects.length > 0) && (
                  <ProjectFolder
                    autoFoldedProjects={autoFoldedProjects}
                    archivedProjects={archivedProjects}
                    subFolders={subFolders}
                    extensions={extensionsData}
                  />
                )}
              </>
            )}
          </div>
        </>
      ) : (
        // Assistant mode sidebar: navigation hub
        <>
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

              <button
                type="button"
                className={`sidebar-item ${state.assistantView === 'home' ? 'sidebar-item-active' : ''}`}
                onClick={() => setAssistantView('home')}
              >
                <Home className="sidebar-nav-icon h-4 w-4" />
                {t('assistant.nav.home')}
              </button>

              <button
                type="button"
                className={`sidebar-item ${state.assistantView === 'conversations' ? 'sidebar-item-active' : ''}`}
                onClick={() => {
                  setAppMode('workspace')
                }}
              >
                <MessageCircle className="sidebar-nav-icon h-4 w-4" />
                {t('assistant.nav.conversations')}
              </button>

              <button
                type="button"
                className={`sidebar-item ${state.assistantView === 'memory' ? 'sidebar-item-active' : ''}`}
                onClick={() => setAssistantView('memory')}
              >
                <Brain className="sidebar-nav-icon h-4 w-4" />
                {t('assistant.nav.memory')}
              </button>

              <button
                type="button"
                className={`sidebar-item ${state.assistantView === 'automations' ? 'sidebar-item-active' : ''}`}
                onClick={() => setAssistantView('automations')}
              >
                <Zap className="sidebar-nav-icon h-4 w-4" />
                {t('assistant.nav.automations')}
              </button>

              <button
                type="button"
                className={`sidebar-item ${state.assistantView === 'channels' ? 'sidebar-item-active' : ''}`}
                onClick={() => setAssistantView('channels')}
              >
                <MessageSquareShare className="sidebar-nav-icon h-4 w-4" />
                {t('assistant.nav.channels')}
              </button>
            </nav>
          </div>
        </>
      )}

      <div className="border-t border-[#dcdddf] dark:border-[#1e2634] px-3 py-3 space-y-2">
        <UpdateButton />
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
      <ProjectDetailsSheet
        project={detailsProject}
        open={detailsProject !== null}
        onClose={() => setDetailsProject(null)}
        onProjectUpdated={handleProjectUpdated}
      />
    </>
  )
}
