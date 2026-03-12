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

  const resolveProvidersFromSnapshot = useCallback((snapshot: unknown): Set<string> | null => {
    const providers = (snapshot as { models?: { providers?: Record<string, unknown> } } | null)
      ?.models?.providers;
    if (!providers || typeof providers !== 'object') {
      return null;
    }
    const keys = Object.keys(providers);
    if (keys.length === 0) {
      return null;
    }
    return new Set(keys);
  }, []);

  const applyProviderFilter = useCallback(
    (allModels: PiModel[], snapshot: unknown): { models: PiModel[]; providers: Set<string> } => {
      const snapshotProviders = resolveProvidersFromSnapshot(snapshot);
      if (!snapshotProviders) {
        // If snapshot is unavailable, use providers from models directly
        // (all models are already filtered to configured providers by listPiModels)
        return {
          models: allModels,
          providers: new Set<string>(allModels.map((model) => model.provider)),
        };
      }
      const filtered = allModels.filter((model) => snapshotProviders.has(model.provider));
      // INVARIANT: listPiModels() already filtered to configured providers
      // so filtered should match snapshotProviders. Do NOT fall back to all models.
      return { models: filtered, providers: snapshotProviders };
    },
    [resolveProvidersFromSnapshot],
  );
  
  // Cleanup on unmount (StrictMode remount safe)
  useEffect(() => {
    isMountedRef.current = true;
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
      const startTime = Date.now();
      const [modelsResult, snapshot] = await Promise.all([
        workspaceIpc.listPiModels(),
        workspaceIpc.getPiConfigSnapshot()
      ]);
      
      const loadDuration = Date.now() - startTime;
      console.log('IPC Results:', {
        modelsOk: modelsResult.ok,
        modelsCount: modelsResult.ok ? modelsResult.models.length : 0,
        snapshotOk: snapshot?.models?.providers,
        durationMs: loadDuration
      });
      
      if (!isMountedRef.current) return null;
      
      if (modelsResult.ok && modelsResult.models.length > 0) {
        console.log('IPC returned', modelsResult.models.length, 'models');

        const filtered = applyProviderFilter(modelsResult.models, snapshot);
        console.log(
          'Using',
          filtered.models.length,
          'models from',
          filtered.providers.size,
          'providers',
        );

        return {
          models: filtered.models,
          providers: filtered.providers,
          source: 'cache' as const
        };
      } else {
        console.error('No models returned from IPC:', modelsResult);
        // Return empty result instead of null to avoid triggering refresh
        return {
          models: [],
          providers: new Set<string>(),
          source: 'cache' as const
        };
      }
    } catch (error) {
      console.error('Failed to load models from cache:', error);
      // Return empty result instead of null to avoid triggering refresh
      return {
        models: [],
        providers: new Set<string>(),
        source: 'cache' as const
      };
    }
  }, [applyProviderFilter]);

  const refreshModelsFromSource = useCallback(async (force = false) => {
    console.log('refreshModelsFromSource called with force:', force);
    
    // If not forcing and cache is still fresh, return cached data
    if (!force) {
      const now = Date.now();
      const cacheAge = now - cacheRef.current.lastUpdated;
      
      if (cacheAge < MODELS_CACHE_TTL_MS) {
        console.log('refreshModelsFromSource - cache still fresh, returning cached data');
        return {
          models: cacheRef.current.models,
          providers: cacheRef.current.providers,
          source: 'cache' as const
        };
      }
    }

    // If we're already refreshing in background, don't start another refresh
    if (isRefreshingInBackground && !force) {
      console.log('refreshModelsFromSource - already refreshing in background, skipping');
      return {
        models: cacheRef.current.models,
        providers: cacheRef.current.providers,
        source: 'cache' as const
      };
    }

    try {
      if (force) {
        console.log('refreshModelsFromSource - setting isRefreshingInBackground to true');
        setIsRefreshingInBackground(true);
      }
      
      const startTime = Date.now();
      const [result, snapshot] = await Promise.all([
        workspaceIpc.syncPiModels(),
        workspaceIpc.getPiConfigSnapshot()
      ]);
      
      console.log('refreshModelsFromSource - IPC completed in', Date.now() - startTime, 'ms');
      
      if (!isMountedRef.current) return null;
      
      if (result.ok) {
        if (result.models.length === 0) {
          console.warn('refreshModelsFromSource - IPC returned 0 models, keeping existing cache');
          if (cacheRef.current.models.length > 0) {
            cacheRef.current = {
              ...cacheRef.current,
              lastChecked: Date.now(),
            };
            return {
              models: cacheRef.current.models,
              providers: cacheRef.current.providers,
              source: 'cache' as const
            };
          }
        }
        const filtered = applyProviderFilter(result.models, snapshot);
        
        console.log('refreshModelsFromSource - updating cache with', filtered.models.length, 'models');
        // Update cache
        cacheRef.current = {
          models: filtered.models,
          providers: filtered.providers,
          lastUpdated: Date.now(),
          lastChecked: Date.now(),
        };
        
        return {
          models: filtered.models,
          providers: filtered.providers,
          source: 'refresh' as const
        };
      }
      console.log('refreshModelsFromSource - IPC failed, result not ok');
      return null;
    } catch (error) {
      console.error('refreshModelsFromSource - failed with error:', error);
      return null;
    } finally {
      if (isMountedRef.current && force) {
        console.log('refreshModelsFromSource - setting isRefreshingInBackground to false');
        setIsRefreshingInBackground(false);
      }
    }
  }, [applyProviderFilter, isRefreshingInBackground]);

  const initializeCache = useCallback(async () => {
    console.log('initializeCache called - setting loading state to true');
    setIsLoadingModels(true);
    setCacheStatus('loading');
    
    try {
      console.log('initializeCache - attempting to load from cache');
      // First try to load from cache
      const cachedResult = await loadModelsFromCache();
      if (!cachedResult) {
        console.warn('initializeCache - cache load returned null, marking stale');
        if (isMountedRef.current) {
          setCacheStatus('stale');
        }
        return;
      }
      
      console.log('initializeCache - cache load result:', {
        hasModels: cachedResult.models.length > 0,
        modelCount: cachedResult.models.length,
        providerCount: cachedResult.providers.size
      });
      
      // Always update cache with whatever we got (even if empty)
      cacheRef.current = {
        models: cachedResult.models,
        providers: cachedResult.providers,
        lastUpdated: Date.now(),
        lastChecked: Date.now(),
      };
      
      if (isMountedRef.current) {
        setModels(cachedResult.models);
        setConfiguredProviders(cachedResult.providers);
        
        // Only attempt refresh if we got no models at all
        if (cachedResult.models.length === 0) {
          console.log('initializeCache - no models in cache, attempting refresh');
          const refreshResult = await refreshModelsFromSource(true);
          
          if (refreshResult && refreshResult.models.length > 0 && isMountedRef.current) {
            console.log('initializeCache - refresh successful, updating state');
            cacheRef.current = {
              models: refreshResult.models,
              providers: refreshResult.providers,
              lastUpdated: Date.now(),
              lastChecked: Date.now(),
            };
            setModels(refreshResult.models);
            setConfiguredProviders(refreshResult.providers);
          } else if (isMountedRef.current) {
            setCacheStatus('stale');
          }
        }
        
        // Check if cache is stale
        const now = Date.now();
        const cacheAge = now - cacheRef.current.lastUpdated;
        setCacheStatus(cacheAge > STALE_THRESHOLD_MS ? 'stale' : 'fresh');
        console.log('initializeCache - state updated successfully');
      }
      
    } catch (error) {
      console.error('initializeCache - failed with error:', error);
      if (isMountedRef.current) {
        setCacheStatus('loading');
      }
    } finally {
      console.log('initializeCache - finally block, setting isLoadingModels to false');
      // Always set loading to false when initialization completes
      if (isMountedRef.current) {
        setIsLoadingModels(false);
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
    }, 15000); // 15 second timeout
    
    // Additional safeguard: Force loading state to false after 30 seconds
    const forceStopTimeout = setTimeout(() => {
      if (isLoadingModels && isMountedRef.current) {
        console.error('Model cache loading forced to stop after timeout');
        setIsLoadingModels(false);
        setCacheStatus('loading');
      }
    }, 30000); // 30 second absolute timeout
    
    return () => {
      clearTimeout(timeout);
      clearTimeout(forceStopTimeout);
    };
  }, [initializeCache, refreshModelsFromSource, isLoadingModels]);

  // Debug: Log when loading state changes
  useEffect(() => {
    console.log('isLoadingModels changed:', isLoadingModels);
  }, [isLoadingModels]);

  // Debug: Log cache status changes
  useEffect(() => {
    console.log('Cache status changed:', cacheStatus);
  }, [cacheStatus]);

  // Set up background refresh interval
  useEffect(() => {
    backgroundRefreshRef.current = setInterval(() => {
      const now = Date.now();
      const cacheAge = now - cacheRef.current.lastUpdated;
      
      // Only refresh if cache is getting stale and we actually have models
      if (cacheAge > MODELS_CACHE_TTL_MS / 2 && cacheRef.current.models.length > 0) {
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
  }, [refreshModelsFromSource, isRefreshingInBackground]);

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
