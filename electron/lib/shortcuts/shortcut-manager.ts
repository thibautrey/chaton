import { app, globalShortcut, BrowserWindow } from 'electron';
import { getDb } from '../../db/index.js';
import { getAppSettings, saveAppSettings } from '../../db/repos/settings.js';

type ShortcutScope = 'foreground' | 'global';

type ShortcutAction = {
  id: string;
  name: string;
  description: string;
  handler: (window?: BrowserWindow) => void;
};

type ShortcutConfig = {
  id: string;
  scope: ShortcutScope;
  accelerator: string;
  actionId: string;
  enabled: boolean;
};

class ShortcutManager {
  private actions: Map<string, ShortcutAction>;
  private configs: Map<string, ShortcutConfig>;
  private registeredGlobalShortcuts: Set<string>;
  private mainWindow: BrowserWindow | null;

  constructor() {
    this.actions = new Map();
    this.configs = new Map();
    this.registeredGlobalShortcuts = new Set();
    this.mainWindow = null;
  }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window;
  }

  registerAction(action: ShortcutAction) {
    // Idempotent: always succeed, handles React Strict Mode double-mounts
    this.actions.set(action.id, action);
    return true;
  }

  unregisterAction(actionId: string) {
    return this.actions.delete(actionId);
  }

  async loadConfigs() {
    try {
      const db = getDb();
      const settings = getAppSettings(db);
      
      if (settings.shortcuts && Array.isArray(settings.shortcuts)) {
        for (const config of settings.shortcuts) {
          this.configs.set(config.id, config);
        }
      }
    } catch (error) {
      console.error('Failed to load shortcut configs:', error);
    }
  }

  async saveConfigs() {
    try {
      const db = getDb();
      const settings = getAppSettings(db);
      
      const configsArray = Array.from(this.configs.values());
      settings.shortcuts = configsArray;
      
      await saveAppSettings(db, settings);
    } catch (error) {
      console.error('Failed to save shortcut configs:', error);
    }
  }

  registerShortcut(config: ShortcutConfig) {
    if (this.configs.has(config.id)) {
      // Idempotent - this is expected during React Strict Mode double-mount
      return false;
    }
    
    this.configs.set(config.id, config);
    
    if (config.scope === 'global' && config.enabled) {
      this.registerGlobalShortcut(config);
    }
    
    return true;
  }

  unregisterShortcut(shortcutId: string) {
    const config = this.configs.get(shortcutId);
    if (!config) return false;
    
    if (config.scope === 'global') {
      this.unregisterGlobalShortcut(config);
    }
    
    this.configs.delete(shortcutId);
    return true;
  }

  private registerGlobalShortcut(config: ShortcutConfig) {
    if (!config.enabled || !config.accelerator) return;
    
    try {
      const success = globalShortcut.register(config.accelerator, () => {
        const action = this.actions.get(config.actionId);
        if (action) {
          action.handler(this.mainWindow || undefined);
        }
      });
      
      // globalShortcut.register returns void, so we assume success if no exception was thrown
      this.registeredGlobalShortcuts.add(config.accelerator);
      console.log(`Registered global shortcut: ${config.accelerator}`);
    } catch (error) {
      console.error(`Error registering global shortcut ${config.accelerator}:`, error);
    }
  }

  private unregisterGlobalShortcut(config: ShortcutConfig) {
    if (!config.accelerator) return;
    
    try {
      globalShortcut.unregister(config.accelerator);
      this.registeredGlobalShortcuts.delete(config.accelerator);
      console.log(`Unregistered global shortcut: ${config.accelerator}`);
    } catch (error) {
      console.error(`Error unregistering global shortcut ${config.accelerator}:`, error);
    }
  }

  updateShortcutConfig(shortcutId: string, updates: Partial<ShortcutConfig>): boolean {
    const config = this.configs.get(shortcutId);
    if (!config) return false;
    
    const oldConfig = { ...config };
    const newConfig = { ...config, ...updates };
    
    // If scope or accelerator changed, we need to re-register
    if (oldConfig.scope === 'global' && newConfig.scope === 'global' && 
        oldConfig.accelerator !== newConfig.accelerator) {
      this.unregisterGlobalShortcut(oldConfig);
      if (newConfig.enabled && newConfig.accelerator) {
        this.registerGlobalShortcut(newConfig);
      }
    } else if (oldConfig.scope !== newConfig.scope) {
      if (oldConfig.scope === 'global') {
        this.unregisterGlobalShortcut(oldConfig);
      }
      if (newConfig.scope === 'global' && newConfig.enabled && newConfig.accelerator) {
        this.registerGlobalShortcut(newConfig);
      }
    } else if (oldConfig.enabled !== newConfig.enabled) {
      if (newConfig.scope === 'global' && newConfig.accelerator) {
        if (newConfig.enabled) {
          this.registerGlobalShortcut(newConfig);
        } else {
          this.unregisterGlobalShortcut(newConfig);
        }
      }
    }
    
    this.configs.set(shortcutId, newConfig);
    return true;
  }

  getShortcutConfig(shortcutId: string): ShortcutConfig | undefined {
    return this.configs.get(shortcutId);
  }

  getAllShortcutConfigs(): ShortcutConfig[] {
    return Array.from(this.configs.values());
  }

  getAction(actionId: string): ShortcutAction | undefined {
    return this.actions.get(actionId);
  }

  getAllActions(): ShortcutAction[] {
    return Array.from(this.actions.values());
  }

  cleanup() {
    // Unregister all global shortcuts
    for (const accelerator of this.registeredGlobalShortcuts) {
      try {
        globalShortcut.unregister(accelerator);
      } catch (error) {
        console.error(`Error unregistering global shortcut during cleanup:`, error);
      }
    }
    this.registeredGlobalShortcuts.clear();
  }

  // Helper method to parse accelerator strings
  static parseAccelerator(accelerator: string): { modifiers: string[], key: string } {
    const parts = accelerator.toLowerCase().split('+');
    const modifiers = [];
    let key = '';
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (['ctrl', 'command', 'cmd', 'shift', 'alt', 'option', 'meta', 'super'].includes(trimmed)) {
        modifiers.push(trimmed);
      } else {
        key = trimmed;
      }
    }
    
    return { modifiers, key };
  }

  // Helper method to format accelerator for display
  static formatAccelerator(accelerator: string): string {
    return accelerator
      .replace('CommandOrControl', process.platform === 'darwin' ? '⌘' : 'Ctrl')
      .replace('Command', '⌘')
      .replace('Ctrl', '⌃')
      .replace('Shift', '⇧')
      .replace('Alt', '⌥')
      .replace('Option', '⌥')
      .replace('Meta', '⌘')
      .replace('Super', '⌘');
  }
}

export { ShortcutManager };
export const shortcutManager = new ShortcutManager();

export function initShortcutManager() {
  // Register app lifecycle hooks
  app.on('will-quit', () => {
    shortcutManager.cleanup();
  });
  
  return shortcutManager;
}