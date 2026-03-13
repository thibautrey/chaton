import { ipcRenderer } from 'electron';

export const shortcutsIpc = {
  registerShortcut: (config: {
    id: string;
    scope: 'foreground' | 'global';
    accelerator: string;
    actionId: string;
    enabled: boolean;
  }) => {
    return ipcRenderer.invoke('shortcuts:register', config);
  },

  unregisterShortcut: (shortcutId: string) => {
    return ipcRenderer.invoke('shortcuts:unregister', shortcutId);
  },

  updateShortcut: (shortcutId: string, updates: Partial<{
    scope: 'foreground' | 'global';
    accelerator: string;
    actionId: string;
    enabled: boolean;
  }>) => {
    return ipcRenderer.invoke('shortcuts:update', shortcutId, updates);
  },

  getShortcut: (shortcutId: string) => {
    return ipcRenderer.invoke('shortcuts:get', shortcutId);
  },

  getAllShortcuts: () => {
    return ipcRenderer.invoke('shortcuts:getAll');
  },

  registerAction: (action: {
    id: string;
    name: string;
    description: string;
  }) => {
    return ipcRenderer.invoke('shortcuts:registerAction', action);
  },

  getAllActions: () => {
    return ipcRenderer.invoke('shortcuts:getAllActions');
  },

  loadConfigs: () => {
    return ipcRenderer.invoke('shortcuts:loadConfigs');
  },

  saveConfigs: () => {
    return ipcRenderer.invoke('shortcuts:saveConfigs');
  },

  formatAccelerator: (accelerator: string) => {
    return ipcRenderer.invoke('shortcuts:formatAccelerator', accelerator);
  },

  onActionTriggered: (callback: (actionId: string) => void) => {
    const handler = (_event: any, data: { actionId: string }) => {
      callback(data.actionId);
    };
    ipcRenderer.on('shortcuts:action-triggered', handler);
    return () => {
      ipcRenderer.off('shortcuts:action-triggered', handler);
    };
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