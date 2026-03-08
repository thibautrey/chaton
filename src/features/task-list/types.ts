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
