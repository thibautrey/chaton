import { useState, useEffect, useRef, useCallback } from 'react';
import type { PiModel } from '@/components/shell/composer/types';
import { workspaceIpc } from '@/services/ipc/workspace';

// Cache TTL constants
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const BACKGROUND_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes (when to show stale warning)

export function useModelCache() {
  const [models, setModels] = useState<PiModel[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set());
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isRefreshingInBackground, setIsRefreshingInBackground] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<'fresh' | 'stale' | 'loading'>('loading');
  
  const cacheRef = useRef<{
    models: PiModel[];
    providers: Set<string>;
    lastUpdated: number;
    lastChecked: number;
  }>({
    models: [],
    providers: new Set(),
    lastUpdated: 0,
    lastChecked: 0,
  });

  const backgroundRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const isInitializedRef = useRef(false);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (backgroundRefreshRef.current) {
        clearInterval(backgroundRefreshRef.current);
      }
    };
  }, []);

  const loadModelsFromCache = useCallback(async () => {
    try {
      console.log('Attempting to load models via IPC...');
      const [modelsResult, snapshot] = await Promise.all([
        workspaceIpc.listPiModels(),
        workspaceIpc.getPiConfigSnapshot()
      ]);
      
      console.log('IPC Results:', {
        modelsOk: modelsResult.ok,
        modelsCount: modelsResult.ok ? modelsResult.models.length : 0,
        snapshotOk: snapshot?.models?.providers
      });
      
      if (!isMountedRef.current) return null;
      
      if (modelsResult.ok && modelsResult.models.length > 0) {
        const providers = new Set(
          Object.keys(((snapshot.models ?? {}).providers ?? {}) as Record<string, unknown>),
        );
        
        const filteredModels = modelsResult.models.filter((model) =>
          providers.has(model.provider),
        );
        
        console.log('Successfully loaded models:', filteredModels.length, 'models from', Array.from(providers).length, 'providers');
        
        return {
          models: filteredModels,
          providers,
          source: 'cache' as const
        };
      } else {
        console.error('No models returned from IPC:', modelsResult);
        return null;
      }
    } catch (error) {
      console.error('Failed to load models from cache:', error);
      return null;
    }
  }, []);

  const refreshModelsFromSource = useCallback(async (force = false) => {
    if (!force) {
      // Check if cache is still fresh enough
      const now = Date.now();
      const cacheAge = now - cacheRef.current.lastUpdated;
      
      if (cacheAge < MODELS_CACHE_TTL_MS) {
        // Cache is still fresh, no need to refresh
        return {
          models: cacheRef.current.models,
          providers: cacheRef.current.providers,
          source: 'cache' as const
        };
      }
    }

    try {
      if (force) {
        setIsRefreshingInBackground(true);
      }
      
      const [result, snapshot] = await Promise.all([
        workspaceIpc.syncPiModels(),
        workspaceIpc.getPiConfigSnapshot()
      ]);
      
      if (!isMountedRef.current) return null;
      
      if (result.ok) {
        const providers = new Set(
          Object.keys(((snapshot.models ?? {}).providers ?? {}) as Record<string, unknown>),
        );
        
        const filteredModels = result.models.filter((model) =>
          providers.has(model.provider),
        );
        
        // Update cache
        cacheRef.current = {
          models: filteredModels,
          providers,
          lastUpdated: Date.now(),
          lastChecked: Date.now(),
        };
        
        return {
          models: filteredModels,
          providers,
          source: 'refresh' as const
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to refresh models:', error);
      return null;
    } finally {
      if (isMountedRef.current && force) {
        setIsRefreshingInBackground(false);
      }
    }
  }, []);

  const initializeCache = useCallback(async () => {
    setIsLoadingModels(true);
    setCacheStatus('loading');
    
    try {
      // First try to load from cache
      const cachedResult = await loadModelsFromCache();
      
      if (cachedResult) {
        cacheRef.current = {
          models: cachedResult.models,
          providers: cachedResult.providers,
          lastUpdated: Date.now(),
          lastChecked: Date.now(),
        };
        
        if (isMountedRef.current) {
          setModels(cachedResult.models);
          setConfiguredProviders(cachedResult.providers);
          
          // Check if cache is stale
          const now = Date.now();
          const cacheAge = now - cacheRef.current.lastUpdated;
          setCacheStatus(cacheAge > STALE_THRESHOLD_MS ? 'stale' : 'fresh');
          setIsLoadingModels(false);
        }
      } else {
        // If cache failed, try to refresh from source immediately
        const refreshResult = await refreshModelsFromSource(true);
        
        if (refreshResult && isMountedRef.current) {
          cacheRef.current = {
            models: refreshResult.models,
            providers: refreshResult.providers,
            lastUpdated: Date.now(),
            lastChecked: Date.now(),
          };
          setModels(refreshResult.models);
          setConfiguredProviders(refreshResult.providers);
          setCacheStatus('fresh');
        } else if (isMountedRef.current) {
          // If refresh also failed, at least stop the loading state
          setCacheStatus('loading');
        }
        
        if (isMountedRef.current) {
          setIsLoadingModels(false);
        }
      }
      
    } catch (error) {
      console.error('Failed to initialize model cache:', error);
      if (isMountedRef.current) {
        setIsLoadingModels(false);
        setCacheStatus('loading');
      }
    }
  }, [loadModelsFromCache, refreshModelsFromSource]);

  // Initial load with timeout fallback
  useEffect(() => {
    // Only initialize once to prevent infinite loops
    if (isInitializedRef.current) {
      console.log('Cache already initialized, skipping...');
      return;
    }
    
    isInitializedRef.current = true;
    console.log('Initializing model cache...');
    void initializeCache();
    
    // Set a timeout to ensure we don't get stuck loading indefinitely
    const timeout = setTimeout(() => {
      if (isLoadingModels) {
        console.warn('Model cache loading timed out, attempting direct load...');
        void refreshModelsFromSource(true);
      }
    }, 10000); // 10 second timeout
    
    return () => clearTimeout(timeout);
  }, [initializeCache, refreshModelsFromSource, isLoadingModels]);

  // Debug: Log when loading state changes (commented out to reduce console spam)
  // useEffect(() => {
  //   console.log('isLoadingModels changed:', isLoadingModels);
  // }, [isLoadingModels]);

  // Debug: Log cache status changes (commented out to reduce console spam)
  // useEffect(() => {
  //   console.log('Cache status changed:', cacheStatus);
  // }, [cacheStatus]);

  // Set up background refresh interval
  useEffect(() => {
    backgroundRefreshRef.current = setInterval(() => {
      const now = Date.now();
      const cacheAge = now - cacheRef.current.lastUpdated;
      
      // Only refresh if cache is getting stale
      if (cacheAge > MODELS_CACHE_TTL_MS / 2) {
        void refreshModelsFromSource(false);
      }
    }, BACKGROUND_REFRESH_INTERVAL_MS);
    
    return () => {
      if (backgroundRefreshRef.current) {
        clearInterval(backgroundRefreshRef.current);
      }
    };
  }, [refreshModelsFromSource]);

  // Periodically check cache status
  useEffect(() => {
    const interval = setInterval(() => {
      if (isMountedRef.current) {
        const now = Date.now();
        const cacheAge = now - cacheRef.current.lastUpdated;
        
        if (cacheAge > STALE_THRESHOLD_MS) {
          setCacheStatus('stale');
        } else {
          setCacheStatus('fresh');
        }
      }
    }, 60_000); // Check every minute
    
    return () => clearInterval(interval);
  }, []);

  const refreshModelsForPicker = useCallback(async () => {
    setCacheStatus('loading');
    try {
      const result = await refreshModelsFromSource(true);
      
      if (result && isMountedRef.current) {
        cacheRef.current = {
          models: result.models,
          providers: result.providers,
          lastUpdated: Date.now(),
          lastChecked: Date.now(),
        };
        setModels(result.models);
        setConfiguredProviders(result.providers);
        setCacheStatus('fresh');
      }
    } catch (error) {
      console.error('Failed to refresh models for picker:', error);
      if (isMountedRef.current) {
        setCacheStatus(cacheRef.current.lastUpdated > 0 ? 'stale' : 'loading');
      }
    }
  }, [refreshModelsFromSource]);

  return {
    models,
    configuredProviders,
    isLoadingModels,
    isRefreshingInBackground,
    cacheStatus,
    refreshModelsForPicker,
  };
}

export type ModelCacheResult = ReturnType<typeof useModelCache>;