import { useMemo } from 'react'

import type { Project, Conversation, ProjectSubFolder } from '@/features/workspace/types'
import type { PiStoreState } from '@/features/workspace/store/pi-store'
import { usePiStore } from '@/features/workspace/store/pi-store'

/**
 * Scoring criteria to decide which projects get auto-folded:
 * - Projects with no recent conversation activity score higher (more foldable)
 * - Projects with no conversations are very foldable
 * - Projects with running conversations or unread completions are NEVER folded
 * - The currently selected project is NEVER folded
 * - Projects already assigned to a user-created subfolder are excluded
 *   from auto-folding (they live in their subfolder)
 *
 * Returns { visible, autoFolded, subFolders } where subFolders contains
 * the user's named folders with their resolved project objects.
 */

const RECENT_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000 // 3 days
const MIN_PROJECTS_TO_FOLD = 5
const MIN_VISIBLE = 3

function hasActiveConversation(
  projectId: string,
  conversations: Conversation[],
  piState: PiStoreState,
): boolean {
  return conversations.some((c) => {
    if (c.projectId !== projectId) return false
    const runtime = piState.piByConversation[c.id]
    if (!runtime) return false
    return (
      runtime.status === 'streaming' ||
      runtime.status === 'starting' ||
      !!runtime.pendingUserMessage
    )
  })
}

function hasUnreadCompletion(
  projectId: string,
  conversations: Conversation[],
  piState: PiStoreState,
): boolean {
  return conversations.some((c) => {
    if (c.projectId !== projectId) return false
    return !!piState.completedActionByConversation[c.id]
  })
}

function getLatestConversationTimestamp(projectId: string, conversations: Conversation[]): number {
  let latest = 0
  for (const c of conversations) {
    if (c.projectId !== projectId) continue
    const ts = new Date(c.lastMessageAt || c.updatedAt).getTime()
    if (ts > latest) latest = ts
  }
  return latest
}

function getConversationCount(projectId: string, conversations: Conversation[]): number {
  return conversations.filter((c) => c.projectId === projectId).length
}

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
  conversations: Conversation[],
  selectedProjectId: string | null,
  subFolderDefs: ProjectSubFolder[],
): ProjectFolderResult {
  const piState = usePiStore((s) => s)

  return useMemo(() => {
    // Filter out archived projects
    const visibleProjects = projects.filter((p) => !p.isArchived)
    const projectMap = new Map(visibleProjects.map((p) => [p.id, p]))

    // Resolve subfolder definitions into actual project objects,
    // filtering out any stale project IDs that no longer exist
    const subFolders: ResolvedSubFolder[] = subFolderDefs.map((sf) => ({
      id: sf.id,
      name: sf.name,
      projects: sf.projectIds.map((id) => projectMap.get(id)).filter(Boolean) as Project[],
    }))

    // Collect all project IDs that are manually placed in subfolders
    const inSubFolder = new Set(subFolderDefs.flatMap((sf) => sf.projectIds))

    // Projects not in any subfolder are candidates for auto-folding
    const unassigned = visibleProjects.filter((p) => !inSubFolder.has(p.id))

    // Separate hidden projects from others
    const hiddenProjects = unassigned.filter((p) => p.isHidden)
    const regularProjects = unassigned.filter((p) => !p.isHidden)

    // If not enough regular projects, don't auto-fold
    if (regularProjects.length <= MIN_PROJECTS_TO_FOLD) {
      return { visible: regularProjects, autoFolded: hiddenProjects, subFolders }
    }

    // eslint-disable-next-line react-hooks/purity
    const now = Date.now()

    type Scored = { project: Project; score: number; pinned: boolean }
    const scored: Scored[] = regularProjects.map((project) => {
      const isSelected = project.id === selectedProjectId
      const isActive = hasActiveConversation(project.id, conversations, piState)
      const hasUnread = hasUnreadCompletion(project.id, conversations, piState)
      const pinned = isSelected || isActive || hasUnread

      if (pinned) {
        return { project, score: -Infinity, pinned: true }
      }

      let score = 0
      const latestTs = getLatestConversationTimestamp(project.id, conversations)
      const convCount = getConversationCount(project.id, conversations)

      if (latestTs === 0) {
        score += 50
      } else {
        const ageMs = now - latestTs
        if (ageMs > RECENT_THRESHOLD_MS) {
          score += Math.min(40, 20 + (ageMs / (24 * 60 * 60 * 1000)))
        } else {
          score += Math.max(0, 5 - (convCount * 0.5))
        }
      }

      if (convCount === 0) {
        score += 20
      }

      return { project, score, pinned: false }
    })

    scored.sort((a, b) => b.score - a.score)

    const pinnedCount = scored.filter((s) => s.pinned).length
    const foldableItems = scored.filter((s) => !s.pinned)
    const desiredVisible = Math.max(MIN_VISIBLE, pinnedCount + Math.ceil(foldableItems.length * 0.4))
    const maxFolded = Math.max(0, regularProjects.length - desiredVisible)

    const autoFolded: Project[] = [...hiddenProjects]
    const visible: Project[] = []

    let foldedCount = 0
    for (const item of scored) {
      if (item.pinned) {
        visible.push(item.project)
      } else if (foldedCount < maxFolded && item.score > 10) {
        autoFolded.push(item.project)
        foldedCount++
      } else {
        visible.push(item.project)
      }
    }

    // Preserve original project order
    const visibleIds = new Set(visible.map((p) => p.id))
    const orderedVisible = regularProjects.filter((p) => visibleIds.has(p.id))
    const orderedFolded = unassigned.filter((p) => !visibleIds.has(p.id))

    return { visible: orderedVisible, autoFolded: orderedFolded, subFolders }
  }, [projects, conversations, selectedProjectId, subFolderDefs, piState])
}
