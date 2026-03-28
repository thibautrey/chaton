import { useMemo } from 'react'

import type { Project, ProjectSubFolder } from '@/features/workspace/types'

/**
 * Simple project organization without automatic hiding/showing.
 * 
 * Visibility rules:
 * - Projects with isArchived = true go to archived (handled separately)
 * - Projects with isHidden = true (manually hidden) go to autoFolded
 * - Projects in user-created subfolders stay in their subfolders
 * - All other projects are visible
 * 
 * Users manually control visibility via the hide/show buttons.
 * No automatic promotion or demotion based on conversation activity.
 */

export type ResolvedSubFolder = {
  id: string
  name: string
  projects: Project[]
}

export type ProjectFolderResult = {
  visible: Project[]
  autoFolded: Project[]
  subFolders: ResolvedSubFolder[]
}

export function useProjectFolder(
  projects: Project[],
  _conversations: unknown[],
  _selectedProjectId: string | null,
  subFolderDefs: ProjectSubFolder[],
): ProjectFolderResult {
  return useMemo(() => {
    // Filter out archived projects (handled separately in Sidebar)
    const activeProjects = projects.filter((p) => !p.isArchived)
    const projectMap = new Map(activeProjects.map((p) => [p.id, p]))

    // Collect all project IDs that are manually placed in subfolders
    const inSubFolder = new Set(subFolderDefs.flatMap((sf) => sf.projectIds))

    // Subfolders: resolve project IDs to project objects
    // Projects in subfolders stay there - no automatic promotion
    const subFolders: ResolvedSubFolder[] = subFolderDefs.map((sf) => ({
      id: sf.id,
      name: sf.name,
      projects: sf.projectIds
        .map((id) => projectMap.get(id))
        .filter((p): p is Project => p !== undefined),
    }))

    // Projects not in any subfolder
    const unassigned = activeProjects.filter((p) => !inSubFolder.has(p.id))

    // Simple split: hidden vs visible (based on manual user action only)
    const hiddenProjects = unassigned.filter((p) => p.isHidden)
    const visibleProjects = unassigned.filter((p) => !p.isHidden)

    return { visible: visibleProjects, autoFolded: hiddenProjects, subFolders }
  }, [projects, subFolderDefs])
}
