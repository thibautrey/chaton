import { useEffect } from 'react';
import { shortcutsIpc } from '@/services/ipc/shortcuts';

// Module-level tracking survives Strict Mode double-mounts
const registeredActions = new Set<string>();
const registeredShortcuts = new Set<string>();

export function useShortcuts() {

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
    // Idempotent: skip if already registered (module-level set survives Strict Mode)
    if (registeredShortcuts.has(config.id)) {
      return true;
    }
    // Mark as registered BEFORE async call to prevent race conditions in Strict Mode
    registeredShortcuts.add(config.id);
    const result = await shortcutsIpc.registerShortcut(config);
    return result;
  };

  const unregisterShortcut = async (shortcutId: string) => {
    registeredShortcuts.delete(shortcutId);
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
    // Idempotent: skip if already registered (module-level set survives Strict Mode)
    if (registeredActions.has(action.id)) {
      return true;
    }
    // Mark as registered BEFORE async call to prevent race conditions in Strict Mode
    registeredActions.add(action.id);
    const result = await shortcutsIpc.registerAction(action);
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