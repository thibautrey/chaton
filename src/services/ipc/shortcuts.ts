// Use the exposed window.shortcuts API instead of direct ipcRenderer import
declare global {
  interface Window {
    shortcuts: {
      register: (config: any) => Promise<any>;
      unregister: (shortcutId: string) => Promise<any>;
      update: (shortcutId: string, updates: any) => Promise<any>;
      get: (shortcutId: string) => Promise<any>;
      getAll: () => Promise<any>;
      registerAction: (action: any) => Promise<any>;
      getAllActions: () => Promise<any>;
      loadConfigs: () => Promise<any>;
      saveConfigs: () => Promise<any>;
      formatAccelerator: (accelerator: string) => Promise<any>;
      onActionTriggered: (callback: (data: { actionId: string }) => void) => () => void;
    };
  }
}

export const shortcutsIpc = {
  registerShortcut: (config: {
    id: string;
    scope: 'foreground' | 'global';
    accelerator: string;
    actionId: string;
    enabled: boolean;
  }) => {
    return window.shortcuts.register(config);
  },

  unregisterShortcut: (shortcutId: string) => {
    return window.shortcuts.unregister(shortcutId);
  },

  updateShortcut: (shortcutId: string, updates: Partial<{
    scope: 'foreground' | 'global';
    accelerator: string;
    actionId: string;
    enabled: boolean;
  }>) => {
    return window.shortcuts.update(shortcutId, updates);
  },

  getShortcut: (shortcutId: string) => {
    return window.shortcuts.get(shortcutId);
  },

  getAllShortcuts: () => {
    return window.shortcuts.getAll();
  },

  registerAction: (action: {
    id: string;
    name: string;
    description: string;
  }) => {
    return window.shortcuts.registerAction(action);
  },

  getAllActions: () => {
    return window.shortcuts.getAllActions();
  },

  loadConfigs: () => {
    return window.shortcuts.loadConfigs();
  },

  saveConfigs: () => {
    return window.shortcuts.saveConfigs();
  },

  formatAccelerator: (accelerator: string) => {
    return window.shortcuts.formatAccelerator(accelerator);
  },

  onActionTriggered: (callback: (actionId: string) => void) => {
    return window.shortcuts.onActionTriggered((data) => callback(data.actionId));
  }
};

// React hook for foreground shortcuts
// Note: This hook should be used in React components only
export function useForegroundShortcuts(shortcuts: Array<{
  accelerator: string;
  callback: () => void;
  deps?: any[];
}>) {
  const { useEffect } = require('react');

  useEffect(() => {
    const handlers = shortcuts.map(shortcut => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Check if the pressed keys match the accelerator
        const parts = shortcut.accelerator.toLowerCase().split('+');
        const modifiers = [];
        let key = '';

        for (const part of parts) {
          const trimmed = part.trim();
          if (['ctrl', 'command', 'cmd', 'shift', 'alt', 'option', 'meta'].includes(trimmed)) {
            modifiers.push(trimmed);
          } else {
            key = trimmed;
          }
        }

        // Check modifiers
        const modifierMatch = modifiers.every(mod => {
          switch (mod) {
            case 'ctrl': return e.ctrlKey;
            case 'command':
            case 'cmd':
            case 'meta': return e.metaKey;
            case 'shift': return e.shiftKey;
            case 'alt':
            case 'option': return e.altKey;
            default: return false;
          }
        });

        // Check key
        const keyMatch = e.key.toLowerCase() === key;

        if (modifierMatch && keyMatch) {
          e.preventDefault();
          e.stopPropagation();
          shortcut.callback();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    });

    return () => {
      handlers.forEach(unregister => unregister());
    };
  }, [shortcuts, ...(shortcuts.flatMap(s => s.deps || []))]);
}