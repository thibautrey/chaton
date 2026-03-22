import { useEffect, useRef } from 'react';
import { shortcutsIpc } from '@/services/ipc/shortcuts';

export function useShortcuts() {
  // Track registered actions and shortcuts to avoid duplicate registration
  const registeredActions = useRef<Set<string>>(new Set());
  const registeredShortcuts = useRef<Set<string>>(new Set());

  // Load shortcut configurations on mount
  useEffect(() => {
    const loadShortcuts = async () => {
      try {
        await shortcutsIpc.loadConfigs();
      } catch (error) {
        console.error('Failed to load shortcut configs:', error);
      }
    };

    loadShortcuts();
  }, []);

  const registerShortcut = async (config: {
    id: string;
    scope: 'foreground' | 'global';
    accelerator: string;
    actionId: string;
    enabled: boolean;
  }) => {
    // Idempotent: skip if already registered
    if (registeredShortcuts.current.has(config.id)) {
      return true;
    }
    const result = await shortcutsIpc.registerShortcut(config);
    if (result) {
      registeredShortcuts.current.add(config.id);
    }
    return result;
  };

  const unregisterShortcut = async (shortcutId: string) => {
    registeredShortcuts.current.delete(shortcutId);
    return await shortcutsIpc.unregisterShortcut(shortcutId);
  };

  const updateShortcut = async (shortcutId: string, updates: Partial<{
    scope: 'foreground' | 'global';
    accelerator: string;
    actionId: string;
    enabled: boolean;
  }>) => {
    return await shortcutsIpc.updateShortcut(shortcutId, updates);
  };

  const getShortcut = async (shortcutId: string) => {
    return await shortcutsIpc.getShortcut(shortcutId);
  };

  const getAllShortcuts = async () => {
    return await shortcutsIpc.getAllShortcuts();
  };

  const registerAction = async (action: {
    id: string;
    name: string;
    description: string;
  }) => {
    // Idempotent: skip if already registered
    if (registeredActions.current.has(action.id)) {
      return true;
    }
    const result = await shortcutsIpc.registerAction(action);
    if (result) {
      registeredActions.current.add(action.id);
    }
    return result;
  };

  const getAllActions = async () => {
    return await shortcutsIpc.getAllActions();
  };

  const saveConfigs = async () => {
    return await shortcutsIpc.saveConfigs();
  };

  const formatAccelerator = async (accelerator: string) => {
    return await shortcutsIpc.formatAccelerator(accelerator);
  };

  return {
    registerShortcut,
    unregisterShortcut,
    updateShortcut,
    getShortcut,
    getAllShortcuts,
    registerAction,
    getAllActions,
    saveConfigs,
    formatAccelerator,
  };
}

export function useShortcutAction(callback: (actionId: string) => void) {
  useEffect(() => {
    const unsubscribe = shortcutsIpc.onActionTriggered(callback);
    return unsubscribe;
  }, [callback]);
}