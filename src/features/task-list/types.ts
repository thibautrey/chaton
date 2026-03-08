export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'error'

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  order: number
  completedAt?: string
  errorMessage?: string
}

export interface TaskList {
  id: string
  title: string
  description?: string
  tasks: Task[]
  createdAt: string
  completedAt?: string
}

// -- Subagent tracking --

export type SubAgentStatus = 'pending' | 'running' | 'completed' | 'error'

export interface SubAgent {
  id: string
  name: string
  description?: string
  status: SubAgentStatus
  // Each subagent can have its own task list
  taskList: TaskList | null
  previousTaskLists: TaskList[]
  createdAt: string
  completedAt?: string
  errorMessage?: string
}

/**
 * Top-level orchestration state for the side panel.
 * The orchestrator (main agent) has its own task list,
 * and subagents are tracked independently with their own tasks.
 */
export interface OrchestrationState {
  // The main orchestrator agent's task list (existing behavior)
  orchestratorTaskList: TaskList | null
  previousOrchestratorTaskLists: TaskList[]
  // Subagents spawned by the orchestrator
  subAgents: SubAgent[]
}
