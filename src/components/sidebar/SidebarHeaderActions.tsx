import { FolderPlus, Plus, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useWorkspace } from '@/features/workspace/store'

import { SortFilterPopover } from './SortFilterPopover'

export function SidebarHeaderActions() {
  const { t } = useTranslation()
  const { importProject, startGlobalConversationDraft } = useWorkspace()

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="sidebar-icon-button"
        aria-label={t("Nouveau fil global")}
        title={t("Nouveau fil global")}
        onClick={() => {
          startGlobalConversationDraft()
        }}
      >
        <Plus className="h-4 w-4" />
      </button>

      <button
        type="button"
        className="sidebar-icon-button"
        aria-label={t("Ajouter un nouveau projet")}
        title={t("Ajouter un nouveau projet")}
        onClick={() => {
          void importProject()
        }}
      >
        <FolderPlus className="h-4 w-4" />
      </button>

      <SortFilterPopover>
        <button
          type="button"
          className="sidebar-icon-button"
          aria-label="Filtrer, trier et organiser les fils"
          title="Filtrer, trier et organiser les fils"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </SortFilterPopover>
    </div>
  )
}
