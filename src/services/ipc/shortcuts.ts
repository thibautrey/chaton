// Use the exposed window.shortcuts API instead of direct ipcRenderer import

declare global {
  interface Window {
    shortcuts: {
      register: (config: ShortcutConfig) => Promise<unknown>;
      unregister: (shortcutId: string) => Promise<unknown>;
      update: (shortcutId: string, updates: Partial<ShortcutConfig>) => Promise<unknown>;
      get: (shortcutId: string) => Promise<unknown>;
      getAll: () => Promise<unknown>;
      registerAction: (action: ShortcutAction) => Promise<unknown>;
      getAllActions: () => Promise<unknown>;
      loadConfigs: () => Promise<unknown>;
      saveConfigs: () => Promise<unknown>;
      formatAccelerator: (accelerator: string) => Promise<unknown>;
      onActionTriggered: (callback: (data: { actionId: string }) => void) => () => void;
    };
  }
}

interface ShortcutConfig {
  id: string;
  scope: 'foreground' | 'global';
  accelerator: string;
  actionId: string;
  enabled: boolean;
}

interface ShortcutAction {
  id: string;
  name: string;
  description: string;
}

export const shortcutsIpc = {
  registerShortcut: (config: ShortcutConfig) => {
    return window.shortcuts.register(config);
  },

  unregisterShortcut: (shortcutId: string) => {
    return window.shortcuts.unregister(shortcutId);
  },

  updateShortcut: (shortcutId: string, updates: Partial<ShortcutConfig>) => {
    return window.shortcuts.update(shortcutId, updates);
  },

  getShortcut: (shortcutId: string) => {
    return window.shortcuts.get(shortcutId);
  },

  getAllShortcuts: () => {
    return window.shortcuts.getAll();
  },

  registerAction: (action: ShortcutAction) => {
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
  deps?: unknown[];
}>) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');

  // Build dependency array statically
  const allDeps: unknown[] = [shortcuts];
  for (const shortcut of shortcuts) {
    if (shortcut.deps) {
      allDeps.push(...shortcut.deps);
    }
  }

  useEffect(() => {
    const handlers = shortcuts.map(shortcut => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Check if the pressed keys match the accelerator
        const parts = shortcut.accelerator.toLowerCase().split('+');
        const modifiers: string[] = [];
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
  }, allDeps);
}
