/**
 * Performance Monitoring Utility
 * Tracks and reports performance metrics to identify bottlenecks
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  isLongTask: boolean;
}

interface ComponentRenderMetric {
  componentName: string;
  renderCount: number;
  averageDuration: number;
  lastRenderDuration: number;
  totalDuration: number;
}

const LONG_TASK_THRESHOLD_MS = 50; // Consider >50ms as long task

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private componentMetrics: Map<string, ComponentRenderMetric> = new Map();
  private enabled: boolean = false;
  private debugMode: boolean = false;

  /**
   * Enable performance monitoring
   */
  enable(debug: boolean = false) {
    this.enabled = true;
    this.debugMode = debug;
    console.log('[Performance Monitor] Enabled');
    this.setupPerformanceObserver();
  }

  /**
   * Disable performance monitoring
   */
  disable() {
    this.enabled = false;
    console.log('[Performance Monitor] Disabled');
  }

  /**
   * Record a performance measurement
   */
  recordMeasure(name: string, startTime: number, endTime: number) {
    if (!this.enabled) return;

    const duration = endTime - startTime;
    const isLongTask = duration > LONG_TASK_THRESHOLD_MS;

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
      isLongTask,
    };

    this.metrics.get(name)!.push(metric);

    if (isLongTask && this.debugMode) {
      console.warn(`[Performance Monitor] Long task detected: "${name}" took ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Record component render
   */
  recordComponentRender(componentName: string, duration?: number) {
    if (!this.enabled) return;

    const renderDuration = duration ?? performance.now();

    if (!this.componentMetrics.has(componentName)) {
      this.componentMetrics.set(componentName, {
        componentName,
        renderCount: 0,
        averageDuration: 0,
        lastRenderDuration: 0,
        totalDuration: 0,
      });
    }

    const metric = this.componentMetrics.get(componentName)!;
    metric.renderCount++;
    metric.lastRenderDuration = renderDuration;
    metric.totalDuration += renderDuration;
    metric.averageDuration = metric.totalDuration / metric.renderCount;

    if (renderDuration > LONG_TASK_THRESHOLD_MS && this.debugMode) {
      console.warn(
        `[Performance Monitor] Slow component render: ${componentName} (${renderDuration.toFixed(2)}ms)`
      );
    }
  }

  /**
   * Get metrics for a specific task
   */
  getMetrics(name: string): PerformanceMetric[] | undefined {
    return this.metrics.get(name);
  }

  /**
   * Get component render metrics
   */
  getComponentMetrics(name?: string): Map<string, ComponentRenderMetric> | ComponentRenderMetric | undefined {
    if (name) {
      return this.componentMetrics.get(name);
    }
    return this.componentMetrics;
  }

  /**
   * Generate performance report
   */
  generateReport() {
    console.group('[Performance Monitor] Report');

    // Task metrics
    console.group('Task Metrics');
    for (const [name, metrics] of this.metrics.entries()) {
      if (metrics.length === 0) continue;

      const longTasks = metrics.filter((m) => m.isLongTask);
      const durations = metrics.map((m) => m.duration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      console.log(`${name}:`, {
        count: metrics.length,
        avg: `${avgDuration.toFixed(2)}ms`,
        max: `${maxDuration.toFixed(2)}ms`,
        min: `${minDuration.toFixed(2)}ms`,
        longTasks: longTasks.length,
      });
    }
    console.groupEnd();

    // Component metrics
    console.group('Component Metrics');
    for (const [name, metric] of this.componentMetrics.entries()) {
      console.log(`${name}:`, {
        renders: metric.renderCount,
        avg: `${metric.averageDuration.toFixed(2)}ms`,
        lastRender: `${metric.lastRenderDuration.toFixed(2)}ms`,
        total: `${metric.totalDuration.toFixed(2)}ms`,
      });
    }
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.componentMetrics.clear();
  }

  /**
   * Setup performance observer for Long Tasks
   */
  private setupPerformanceObserver() {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > LONG_TASK_THRESHOLD_MS && this.debugMode) {
            console.warn(`[Performance Monitor] Long task: ${entry.name} (${entry.duration.toFixed(2)}ms)`);
          }
        }
      });

      // Observe long tasks
      observer.observe({ entryTypes: ['longtask', 'measure'] });
    } catch {
      console.debug('[Performance Monitor] PerformanceObserver not available');
    }
  }

  /**
   * Export metrics as JSON for analysis
   */
  exportMetrics() {
    const taskMetrics = Array.from(this.metrics.entries()).map(([name, metrics]) => ({
      name,
      count: metrics.length,
      data: metrics,
    }));

    const componentMetrics = Array.from(this.componentMetrics.entries()).map(([name, metric]) => ({
      name,
      ...metric,
    }));

    return {
      taskMetrics,
      componentMetrics,
      timestamp: new Date().toISOString(),
    };
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();
