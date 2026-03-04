// electron/ipc/pi.ts
// Module IPC pour exposer les fonctionnalités de Pi au frontend

import { ipcMain } from 'electron';
import { getModels, getSettings, updateSettings, isUsingUserConfig } from '../lib/pi/pi-manager.js';
import { getLogManager } from '../lib/logging/log-manager.js';

/**
 * Enregistre les handlers IPC pour Pi
 */
export function registerPiIpc() {
  // Récupère la liste des modèles disponibles
  ipcMain.handle('pi:getModels', () => {
    try {
      return getModels();
    } catch (error) {
      console.error('Erreur lors de la récupération des modèles:', error);
      return [];
    }
  });

  // Récupère les paramètres de l'utilisateur
  ipcMain.handle('pi:getSettings', () => {
    try {
      return getSettings();
    } catch (error) {
      console.error('Erreur lors de la récupération des paramètres:', error);
      return {};
    }
  });

  // Met à jour les paramètres de l'utilisateur
  ipcMain.handle('pi:updateSettings', (_, newSettings) => {
    try {
      updateSettings(newSettings);
      return getSettings();
    } catch (error) {
      console.error('Erreur lors de la mise à jour des paramètres:', error);
      return {};
    }
  });

  // Vérifie si la configuration de l'utilisateur est utilisée
  ipcMain.handle('pi:isUsingUserConfig', () => {
    try {
      return isUsingUserConfig();
    } catch (error) {
      console.error('Erreur lors de la vérification de la configuration:', error);
      return false;
    }
  });

  // Récupère les logs
  ipcMain.handle('logs:getLogs', async (_, limit: number = 100) => {
    try {
      const logManager = getLogManager();
      return await logManager.getLogs(limit);
    } catch (error) {
      console.error('Erreur lors de la récupération des logs:', error);
      return [];
    }
  });

  // Efface les logs
  ipcMain.handle('logs:clearLogs', async () => {
    try {
      const logManager = getLogManager();
      return await logManager.clearLogs();
    } catch (error) {
      console.error('Erreur lors de l\'effacement des logs:', error);
      return false;
    }
  });

  // Récupère le chemin du fichier de log
  ipcMain.handle('logs:getLogFilePath', () => {
    try {
      const logManager = getLogManager();
      return logManager.getLogFilePath();
    } catch (error) {
      console.error('Erreur lors de la récupération du chemin du fichier de log:', error);
      return '';
    }
  });
}
