import { useEffect } from 'react';
import { shortcutsIpc } from '@/services/ipc/shortcuts';

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
    return await shortcutsIpc.registerShortcut(config);
  };

  const unregisterShortcut = async (shortcutId: string) => {
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
    return await shortcutsIpc.registerAction(action);
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