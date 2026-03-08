/**
 * Lightweight performance monitor for workspace state updates.
 *
 * Accumulates per-second counters and prints a summary table
 * to the browser console every REPORT_INTERVAL_MS.
 *
 * Enable via:   perfMonitor.enable()
 * Disable via:  perfMonitor.disable()
 * One-shot:     perfMonitor.report()
 *
 * Also exposed on `window.__perf` for quick devtools access.
 */

const REPORT_INTERVAL_MS = 5_000

type CounterMap = Record<string, number>

let enabled = false
let intervalId: ReturnType<typeof setInterval> | null = null

// Accumulated counters since last report
let dispatchCounts: CounterMap = {}
let piStoreUpdateCount = 0
let contextValueChangeCount = 0
let componentRenderCounts: CounterMap = {}
let lastReportAt = Date.now()

// --- Recording API (called from instrumented sites) ---

function recordDispatch(actionType: string) {
  if (!enabled) return
  dispatchCounts[actionType] = (dispatchCounts[actionType] ?? 0) + 1
}

function recordPiStoreUpdate() {
  if (!enabled) return
  piStoreUpdateCount += 1
}

function recordContextValueChange() {
  if (!enabled) return
  contextValueChangeCount += 1
}

function recordComponentRender(name: string) {
  if (!enabled) return
  componentRenderCounts[name] = (componentRenderCounts[name] ?? 0) + 1
}

// --- Reporting ---

function report() {
  const now = Date.now()
  const elapsedSec = Math.max((now - lastReportAt) / 1000, 0.001)

  const dispatchTotal = Object.values(dispatchCounts).reduce((s, n) => s + n, 0)
  const renderTotal = Object.values(componentRenderCounts).reduce((s, n) => s + n, 0)

  console.group(
    `%c[perf] ${elapsedSec.toFixed(1)}s window`,
    'color: #6cf; font-weight: bold',
  )

  // Dispatch summary
  console.log(
    `Dispatches: %c${dispatchTotal}%c total  (${(dispatchTotal / elapsedSec).toFixed(1)}/s)`,
    'font-weight:bold', '',
  )
  if (dispatchTotal > 0) {
    const sorted = Object.entries(dispatchCounts).sort((a, b) => b[1] - a[1])
    console.table(
      Object.fromEntries(
        sorted.map(([type, count]) => [
          type,
          { count, '/s': +(count / elapsedSec).toFixed(1) },
        ]),
      ),
    )
  }

  // Pi store
  console.log(
    `Pi store updates: %c${piStoreUpdateCount}%c  (${(piStoreUpdateCount / elapsedSec).toFixed(1)}/s)`,
    'font-weight:bold', '',
  )

  // Context value changes
  console.log(
    `Context value changes: %c${contextValueChangeCount}%c  (${(contextValueChangeCount / elapsedSec).toFixed(1)}/s)`,
    'font-weight:bold', '',
  )

  // Component renders
  console.log(
    `Component renders: %c${renderTotal}%c total  (${(renderTotal / elapsedSec).toFixed(1)}/s)`,
    'font-weight:bold', '',
  )
  if (renderTotal > 0) {
    const sorted = Object.entries(componentRenderCounts).sort((a, b) => b[1] - a[1])
    console.table(
      Object.fromEntries(
        sorted.map(([name, count]) => [
          name,
          { count, '/s': +(count / elapsedSec).toFixed(1) },
        ]),
      ),
    )
  }

  console.groupEnd()

  // Reset counters
  dispatchCounts = {}
  piStoreUpdateCount = 0
  contextValueChangeCount = 0
  componentRenderCounts = {}
  lastReportAt = now
}

// --- Lifecycle ---

function enable() {
  if (enabled) return
  enabled = true
  lastReportAt = Date.now()
  intervalId = setInterval(report, REPORT_INTERVAL_MS)
  console.log(
    `%c[perf] enabled — reporting every ${REPORT_INTERVAL_MS / 1000}s`,
    'color: #6cf',
  )
}

function disable() {
  if (!enabled) return
  report() // flush last window
  enabled = false
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  console.log('%c[perf] disabled', 'color: #6cf')
}

export const perfMonitor = {
  enable,
  disable,
  report,
  recordDispatch,
  recordPiStoreUpdate,
  recordContextValueChange,
  recordComponentRender,
  get enabled() {
    return enabled
  },
}

// Expose on window for quick devtools access
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__perf = perfMonitor
}
