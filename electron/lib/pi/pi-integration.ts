// electron/lib/pi/pi-integration.ts
// Intégration avec Pi Coding Agent - Version Electron

import electron from 'electron';
const { app } = electron;
import path from 'path';
import fs from 'fs';

/**
 * Initialise Pi Coding Agent
 * @returns Chemin vers la configuration de Pi
 */
export function initializePi(): string {
  try {
    // Mode interne strict: toujours utiliser le dossier app userData.
    const internalPiPath = path.join(app.getPath('userData'), '.pi', 'agent');
    if (!fs.existsSync(internalPiPath)) {
      fs.mkdirSync(internalPiPath, { recursive: true });
    }
    console.log('Utilisation de la configuration Pi interne (userData)');
    return internalPiPath;
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de Pi:', error);
    throw error;
  }
}

/**
 * Récupère les modèles disponibles
 * @param configPath Chemin vers la configuration de Pi
 * @returns Liste des modèles disponibles
 */
export function getAvailableModels(configPath: string): any[] {
  try {
    const modelsPath = path.join(configPath, 'models.json');
    if (!fs.existsSync(modelsPath)) {
      console.log('Aucun models.json trouvé, retour d\'une liste vide');
      return [];
    }

    const modelsJson = JSON.parse(fs.readFileSync(modelsPath, 'utf-8')) as {
      providers?: Record<string, { models?: Array<{ id?: string; reasoning?: unknown; vision?: unknown; imageInput?: unknown }> }>;
    };
    const providers = modelsJson.providers ?? {};

    return Object.entries(providers).flatMap(([providerName, providerValue]) => {
      const providerModels = Array.isArray(providerValue?.models) ? providerValue.models : [];
      return providerModels
        .map((model) => {
          if (!model || typeof model.id !== 'string' || model.id.trim().length === 0) {
            return null;
          }
          const capabilities = ['chat', 'code'];
          if (Boolean(model.reasoning)) {
            capabilities.push('thinking');
          }
          if (Boolean(model.vision) || Boolean(model.imageInput)) {
            capabilities.push('images');
          }
          return {
            id: `${providerName}/${model.id}`,
            name: model.id,
            provider: providerName,
            capabilities,
          };
        })
        .filter((item): item is { id: string; name: string; provider: string; capabilities: string[] } => item !== null);
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des modèles:', error);
    return [];
  }
}

/**
 * Récupère les paramètres de l'utilisateur
 * @param configPath Chemin vers la configuration de Pi
 * @returns Paramètres de l'utilisateur
 */
export function getUserSettings(configPath: string): any {
  try {
    const settingsPath = path.join(configPath, 'settings.json');
    
    if (fs.existsSync(settingsPath)) {
      const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(settingsContent);
    }
    
    return {};
  } catch (error) {
    console.error('Erreur lors de la lecture des paramètres:', error);
    return {};
  }
}

/**
 * Met à jour les paramètres de l'utilisateur
 * @param configPath Chemin vers la configuration de Pi
 * @param newSettings Nouveaux paramètres
 */
export function updateUserSettings(configPath: string, newSettings: any): void {
  try {
    const settingsPath = path.join(configPath, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2), 'utf-8');
  } catch (error) {
    console.error('Erreur lors de la mise à jour des paramètres:', error);
    throw error;
  }
}
