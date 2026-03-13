import { ipcMain } from 'electron';
import { shortcutManager, ShortcutManager } from '../lib/shortcuts/shortcut-manager.js';

export function registerShortcutsIpc() {
  // Register a new shortcut
  ipcMain.handle('shortcuts:register', (_event, config: any) => {
    try {
      return shortcutManager.registerShortcut(config);
    } catch (error) {
      console.error('Error registering shortcut:', error);
      return false;
    }
  });

  // Unregister a shortcut
  ipcMain.handle('shortcuts:unregister', (_event, shortcutId: string) => {
    try {
      return shortcutManager.unregisterShortcut(shortcutId);
    } catch (error) {
      console.error('Error unregistering shortcut:', error);
      return false;
    }
  });

  // Update shortcut configuration
  ipcMain.handle('shortcuts:update', (_event, shortcutId: string, updates: any) => {
    try {
      return shortcutManager.updateShortcutConfig(shortcutId, updates);
    } catch (error) {
      console.error('Error updating shortcut:', error);
      return false;
    }
  });

  // Get shortcut configuration
  ipcMain.handle('shortcuts:get', (_event, shortcutId: string) => {
    try {
      return shortcutManager.getShortcutConfig(shortcutId);
    } catch (error) {
      console.error('Error getting shortcut:', error);
      return null;
    }
  });

  // Get all shortcut configurations
  ipcMain.handle('shortcuts:getAll', (_event) => {
    try {
      return shortcutManager.getAllShortcutConfigs();
    } catch (error) {
      console.error('Error getting all shortcuts:', error);
      return [];
    }
  });

  // Register an action
  ipcMain.handle('shortcuts:registerAction', (_event, action: any) => {
    try {
      return shortcutManager.registerAction({
        id: action.id,
        name: action.name,
        description: action.description,
        handler: (window) => {
          if (window) {
            window.webContents.send('shortcuts:action-triggered', {
              actionId: action.id
            });
          }
        }
      });
    } catch (error) {
      console.error('Error registering action:', error);
      return false;
    }
  });

  // Get all registered actions
  ipcMain.handle('shortcuts:getAllActions', (_event) => {
    try {
      const actions = shortcutManager.getAllActions();
      return actions.map(action => ({
        id: action.id,
        name: action.name,
        description: action.description
      }));
    } catch (error) {
      console.error('Error getting all actions:', error);
      return [];
    }
  });

  // Load shortcut configurations
  ipcMain.handle('shortcuts:loadConfigs', async (_event) => {
    try {
      await shortcutManager.loadConfigs();
      return true;
    } catch (error) {
      console.error('Error loading shortcut configs:', error);
      return false;
    }
  });

  // Save shortcut configurations
  ipcMain.handle('shortcuts:saveConfigs', async (_event) => {
    try {
      await shortcutManager.saveConfigs();
      return true;
    } catch (error) {
      console.error('Error saving shortcut configs:', error);
      return false;
    }
  });

  // Format accelerator for display
  ipcMain.handle('shortcuts:formatAccelerator', (_event, accelerator: string) => {
    try {
      return ShortcutManager.formatAccelerator(accelerator);
    } catch (error) {
      console.error('Error formatting accelerator:', error);
      return accelerator;
    }
  });
}