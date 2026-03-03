import type { Project, SidebarSettings, WorkspacePayload } from '@/features/workspace/types'

type ImportProjectResult =
  | { ok: true; duplicate: boolean; project: Project }
  | { ok: false; reason: 'not_git_repo' | 'unknown' }

function getApi() {
  return window.dashboard
}

export const workspaceIpc = {
  getInitialState: () => getApi().getInitialState(),
  pickProjectFolder: () => getApi().pickProjectFolder(),
  importProjectFromFolder: (folderPath: string) => getApi().importProjectFromFolder(folderPath),
  updateSettings: (settings: SidebarSettings) => getApi().updateSettings(settings),
}

export type { ImportProjectResult, WorkspacePayload }
