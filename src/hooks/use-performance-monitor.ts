/**
 * Hook for performance monitoring in React components
 * Automatically tracks render times and component performance
 */

import { useEffect, useRef } from 'react';
import { performanceMonitor } from '@/utils/performance-monitor';

interface UsePerformanceMonitorOptions {
  enabled?: boolean;
  debugMode?: boolean;
  componentName?: string;
}

/**
 * Hook to monitor performance in a component
 * Tracks render times and identifies slow renders
 */
export function usePerformanceMonitor(options?: UsePerformanceMonitorOptions) {
  const { enabled = true, debugMode = false, componentName } = options || {};
  const startTimeRef = useRef<number>(0);

  // Initialize monitor on first use
  useEffect(() => {
    if (enabled) {
      performanceMonitor.enable(debugMode);
    }
  }, [enabled, debugMode]);

  // Record render time
  useEffect(() => {
    if (enabled && componentName) {
      startTimeRef.current = performance.now();

      return () => {
        const duration = performance.now() - startTimeRef.current;
        performanceMonitor.recordComponentRender(componentName, duration);
      };
    }
  }, [enabled, componentName]);

  return {
    recordMeasure: performanceMonitor.recordMeasure.bind(performanceMonitor),
    getMetrics: performanceMonitor.getMetrics.bind(performanceMonitor),
    generateReport: performanceMonitor.generateReport.bind(performanceMonitor),
    reset: performanceMonitor.reset.bind(performanceMonitor),
  };
}

export { performanceMonitor };
