import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'

import { workspaceIpc } from '@/services/ipc/workspace'

import type { Project, SidebarSettings, WorkspaceState } from './types'

type Action =
  | { type: 'hydrate'; payload: Pick<WorkspaceState, 'projects' | 'conversations' | 'settings'> }
  | { type: 'selectProject'; payload: { projectId: string } }
  | { type: 'selectConversation'; payload: { conversationId: string } }
  | { type: 'toggleProjectCollapsed'; payload: { projectId: string } }
  | { type: 'setSearchQuery'; payload: { query: string } }
  | { type: 'updateSettings'; payload: SidebarSettings }
  | { type: 'addProject'; payload: { project: Project } }
  | { type: 'setNotice'; payload: { notice: string | null } }

const defaultSettings: SidebarSettings = {
  organizeBy: 'project',
  sortBy: 'updated',
  show: 'all',
  searchQuery: '',
  collapsedProjectIds: [],
}

const initialState: WorkspaceState = {
  projects: [],
  conversations: [],
  selectedProjectId: null,
  selectedConversationId: null,
  settings: defaultSettings,
  notice: null,
}

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'hydrate': {
      const selectedProjectId = action.payload.projects[0]?.id ?? null
      const firstConversation = action.payload.conversations.find((c) => c.projectId === selectedProjectId)
      return {
        ...state,
        projects: action.payload.projects,
        conversations: action.payload.conversations,
        settings: action.payload.settings,
        selectedProjectId,
        selectedConversationId: firstConversation?.id ?? action.payload.conversations[0]?.id ?? null,
      }
    }
    case 'selectProject': {
      const firstConversation = state.conversations.find((conversation) => conversation.projectId === action.payload.projectId)
      return {
        ...state,
        selectedProjectId: action.payload.projectId,
        selectedConversationId: firstConversation?.id ?? state.selectedConversationId,
      }
    }
    case 'selectConversation': {
      const conversation = state.conversations.find((c) => c.id === action.payload.conversationId)
      return {
        ...state,
        selectedConversationId: action.payload.conversationId,
        selectedProjectId: conversation ? conversation.projectId : state.selectedProjectId,
      }
    }
    case 'toggleProjectCollapsed': {
      const exists = state.settings.collapsedProjectIds.includes(action.payload.projectId)
      const collapsedProjectIds = exists
        ? state.settings.collapsedProjectIds.filter((id) => id !== action.payload.projectId)
        : [...state.settings.collapsedProjectIds, action.payload.projectId]

      return {
        ...state,
        settings: {
          ...state.settings,
          collapsedProjectIds,
        },
      }
    }
    case 'setSearchQuery': {
      return {
        ...state,
        settings: {
          ...state.settings,
          searchQuery: action.payload.query,
        },
      }
    }
    case 'updateSettings': {
      return {
        ...state,
        settings: action.payload,
      }
    }
    case 'addProject': {
      return {
        ...state,
        projects: [action.payload.project, ...state.projects],
        selectedProjectId: action.payload.project.id,
        settings: {
          ...state.settings,
          collapsedProjectIds: state.settings.collapsedProjectIds.filter((id) => id !== action.payload.project.id),
        },
      }
    }
    case 'setNotice': {
      return {
        ...state,
        notice: action.payload.notice,
      }
    }
    default:
      return state
  }
}

type WorkspaceContextValue = {
  state: WorkspaceState
  isLoading: boolean
  selectProject: (projectId: string) => void
  selectConversation: (conversationId: string) => void
  toggleProjectCollapsed: (projectId: string) => void
  importProject: () => Promise<void>
  updateSettings: (settings: SidebarSettings) => Promise<void>
  setSearchQuery: (query: string) => Promise<void>
  setNotice: (notice: string | null) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    workspaceIpc
      .getInitialState()
      .then((payload) => {
        if (!mounted) {
          return
        }

        dispatch({ type: 'hydrate', payload })
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  const persistSettings = useCallback(async (settings: SidebarSettings) => {
    const saved = await workspaceIpc.updateSettings(settings)
    dispatch({ type: 'updateSettings', payload: saved })
  }, [])

  const toggleProjectCollapsed = useCallback(
    async (projectId: string) => {
      const exists = state.settings.collapsedProjectIds.includes(projectId)
      const collapsedProjectIds = exists
        ? state.settings.collapsedProjectIds.filter((id) => id !== projectId)
        : [...state.settings.collapsedProjectIds, projectId]
      await persistSettings({ ...state.settings, collapsedProjectIds })
    },
    [persistSettings, state.settings],
  )

  const importProject = useCallback(async () => {
    const folderPath = await workspaceIpc.pickProjectFolder()
    if (!folderPath) {
      return
    }

    const result = await workspaceIpc.importProjectFromFolder(folderPath)
    if (!result.ok) {
      dispatch({ type: 'setNotice', payload: { notice: 'Le dossier sélectionné n’est pas un repo Git.' } })
      return
    }

    dispatch({
      type: 'setNotice',
      payload: {
        notice: result.duplicate
          ? 'Projet déjà importé, sélection appliquée.'
          : 'Projet importé avec succès.',
      },
    })

    dispatch({ type: 'addProject', payload: { project: result.project } })
    dispatch({ type: 'selectProject', payload: { projectId: result.project.id } })
  }, [])

  const value = useMemo(
    () => ({
      state,
      isLoading,
      selectProject: (projectId: string) => dispatch({ type: 'selectProject', payload: { projectId } }),
      selectConversation: (conversationId: string) => dispatch({ type: 'selectConversation', payload: { conversationId } }),
      toggleProjectCollapsed,
      importProject,
      updateSettings: persistSettings,
      setSearchQuery: async (query: string) => {
        await persistSettings({ ...state.settings, searchQuery: query })
      },
      setNotice: (notice: string | null) => dispatch({ type: 'setNotice', payload: { notice } }),
    }),
    [importProject, isLoading, persistSettings, state, toggleProjectCollapsed],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }

  return context
}
