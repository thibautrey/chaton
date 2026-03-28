// electron/ipc/pi.ts
// Module IPC pour exposer les fonctionnalités de Pi au frontend

import fs from 'node:fs';
import path from 'node:path';
import electron from 'electron';
const { ipcMain, BrowserWindow, dialog } = electron;
import { getModels, getSettings, updateSettings, isUsingUserConfig } from '../lib/pi/pi-manager.js';
import { getLogManager } from '../lib/logging/log-manager.js';
import { getSentryTelemetry } from '../lib/telemetry/sentry.js';

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
  ipcMain.handle('logs:getLogs', async (_, limit: number = 100, conversationId?: string | null) => {
    try {
      const logManager = getLogManager();
      const logs = await logManager.getLogs(limit);
      if (!conversationId) {
        return logs;
      }
      return logs.filter((entry) => entry.conversationId === conversationId);
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

  ipcMain.handle('logs:saveCopy', async () => {
    try {
      const logManager = getLogManager();
      const sourcePath = logManager.getLogFilePath();
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return { ok: false as const, message: 'Aucun fichier de log disponible.' };
      }

      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const result = await dialog.showSaveDialog(win, {
        title: 'Enregistrer une copie des logs',
        defaultPath: path.basename(sourcePath),
        filters: [{ name: 'Log files', extensions: ['log', 'txt'] }],
      });

      // @ts-ignore Electron typing mismatch
      if (result.canceled || !result.filePath) {
        return { ok: true as const, cancelled: true as const };
      }

      // @ts-ignore Electron typing mismatch
      fs.copyFileSync(sourcePath, result.filePath);
      return { ok: true as const, filePath: result.filePath };
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des logs:', error);
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('telemetry:log', (_event, level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => {
    console.log(`[Telemetry][frontend][${level.toUpperCase()}] ${message}`, data)
    const telemetry = getSentryTelemetry()
    telemetry?.send({
      timestamp: new Date().toISOString(),
      source: 'frontend',
      level,
      message,
      data,
    })
    return true
  })

  ipcMain.handle('telemetry:crash', (_event, payload: { message: string; stack?: string; context?: unknown }) => {
    const telemetry = getSentryTelemetry()
    telemetry?.send({
      timestamp: new Date().toISOString(),
      source: 'frontend',
      level: 'error',
      message: 'renderer_crash',
      data: payload,
    })
    return true
  })
}
