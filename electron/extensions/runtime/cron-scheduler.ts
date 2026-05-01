import type { CronJob } from 'cron'

let cronModule: typeof import('cron') | null = null

async function getCronModule() {
  if (!cronModule) {
    try {
      cronModule = await import('cron')
    } catch (error) {
      console.warn('[CronScheduler] Failed to load cron module:', error)
      return null
    }
  }
  return cronModule
}

export interface ScheduledCronTask {
  ruleId: string
  expression: string
  job: CronJob | null
}

/**
 * Manager for cron-scheduled automation tasks.
 * Handles scheduling, starting, stopping, and cleanup of cron jobs.
 */
export class CronScheduler {
  private tasks: Map<string, ScheduledCronTask> = new Map()
  private isInitialized = false

  async initialize(): Promise<boolean> {
    const cron = await getCronModule()
    if (!cron) return false
    this.isInitialized = true
    return true
  }

  /**
   * Schedule a cron task that will execute the given callback at the specified times.
   * @param ruleId - Unique identifier for the rule
   * @param cronExpression - Valid cron expression (e.g., "0 9 * * *")
   * @param onTick - Callback to execute when the cron job ticks
   * @returns true if scheduled successfully, false otherwise
   */
  async schedule(ruleId: string, cronExpression: string, onTick: () => void | Promise<void>): Promise<boolean> {
    if (!this.isInitialized) {
      const initialized = await this.initialize()
      if (!initialized) {
        console.error('[CronScheduler] Not initialized, cannot schedule task:', ruleId)
        return false
      }
    }

    const cron = await getCronModule()
    if (!cron) {
      console.error('[CronScheduler] Cron module not available')
      return false
    }

    try {
      // Stop existing job if any
      if (this.tasks.has(ruleId)) {
        this.stop(ruleId)
      }

      const job = new cron.CronJob(cronExpression, onTick, null, false, 'UTC')
      this.tasks.set(ruleId, {
        ruleId,
        expression: cronExpression,
        job,
      })

      job.start()
      console.log(`[CronScheduler] Scheduled cron task "${ruleId}" with expression: ${cronExpression}`)
      return true
    } catch (error) {
      console.error(`[CronScheduler] Failed to schedule task "${ruleId}":`, error)
      return false
    }
  }

  /**
   * Stop and remove a scheduled cron task.
   */
  stop(ruleId: string): boolean {
    const task = this.tasks.get(ruleId)
    if (!task) return false

    if (task.job) {
      try {
        task.job.stop()
      } catch {
        // ignore — job may already be stopped
      }
    }
    this.tasks.delete(ruleId)
    console.log(`[CronScheduler] Stopped cron task "${ruleId}"`)
    return true
  }

  /**
   * Restart a previously scheduled task.
   */
  restart(ruleId: string): boolean {
    const task = this.tasks.get(ruleId)
    if (!task || !task.job) return false

    try {
      task.job.start()
      console.log(`[CronScheduler] Restarted cron task "${ruleId}"`)
      return true
    } catch (error) {
      console.error(`[CronScheduler] Failed to restart task "${ruleId}":`, error)
      return false
    }
  }

  /**
   * Get info about a scheduled task.
   */
  getTask(ruleId: string): ScheduledCronTask | undefined {
    return this.tasks.get(ruleId)
  }

  /**
   * Get all scheduled tasks.
   */
  getAllTasks(): ScheduledCronTask[] {
    return Array.from(this.tasks.values())
  }

  /**
   * Stop all scheduled tasks (usually called on shutdown).
   */
  stopAll(): void {
    for (const task of this.tasks.values()) {
      if (task.job) {
        try {
          task.job.stop()
        } catch {
          // ignore — job may already be stopped
        }
      }
    }
    this.tasks.clear()
    console.log('[CronScheduler] Stopped all cron tasks')
  }

  /**
   * Check if a task is currently running.
   */
  isRunning(ruleId: string): boolean {
    const task = this.tasks.get(ruleId)
    return task?.job?.running === true
  }

  /**
   * Get the next execution time for a task.
   */
  getNextDate(ruleId: string): Date | null {
    const task = this.tasks.get(ruleId)
    if (!task?.job) return null
    try {
      return task.job.nextDate()?.toDate() || null
    } catch {
      return null
    }
  }
}

// Singleton instance
let scheduler: CronScheduler | null = null

export async function getCronScheduler(): Promise<CronScheduler> {
  if (!scheduler) {
    scheduler = new CronScheduler()
    await scheduler.initialize()
  }
  return scheduler
}

export async function shutdownCronScheduler(): Promise<void> {
  if (scheduler) {
    scheduler.stopAll()
    scheduler = null
  }
}
