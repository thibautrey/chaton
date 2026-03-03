import type { Project, SidebarSettings, WorkspacePayload } from '@/features/workspace/types'

declare global {
  interface Window {
    dashboard: {
      platform: string
      pickProjectFolder: () => Promise<string | null>
      importProjectFromFolder: (
        folderPath: string,
      ) => Promise<{ ok: true; duplicate: boolean; project: Project } | { ok: false; reason: 'not_git_repo' | 'unknown' }>
      getInitialState: () => Promise<WorkspacePayload>
      updateSettings: (settings: SidebarSettings) => Promise<SidebarSettings>
    }
  }
}

export {}
