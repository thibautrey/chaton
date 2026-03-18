// src/lib/pi-integration.ts
// Module pour intégrer Pi Coding Agent dans l'application
// Gère à la fois le mode embarqué et le mode externe (utilisateur)

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

// Chemins de configuration
const USER_PI_DIR = join(homedir(), '.pi', 'agent');
const LOCAL_PI_DIR = join(process.cwd(), '.pi', 'agent');

// Noms des fichiers de configuration
const CONFIG_FILES = ['settings.json', 'models.json', 'auth.json'];

// Types for model configuration
type ModelConfig = {
  id: string;
  name: string;
  capabilities?: string[];
};

type ProviderConfig = {
  id: string;
  name: string;
  models: ModelConfig[];
};

type ModelsConfig = {
  providers: ProviderConfig[];
};

type AvailableModel = {
  id: string;
  name: string;
  provider: string;
  capabilities?: string[];
};

/**
 * Détecte si Pi est installé sur la machine de l'utilisateur
 * @returns true si Pi est installé, false sinon
 */
export function isPiInstalled(): boolean {
  return existsSync(USER_PI_DIR) && CONFIG_FILES.every(file => existsSync(join(USER_PI_DIR, file)));
}

/**
 * Crée une configuration locale par défaut pour Pi
 */
export function createLocalPiConfig(): void {
  if (!existsSync(LOCAL_PI_DIR)) {
    mkdirSync(LOCAL_PI_DIR, { recursive: true });
  }

  // Configuration par défaut pour settings.json
  if (!existsSync(join(LOCAL_PI_DIR, 'settings.json'))) {
    const defaultSettings = {
      enabledModels: [],
      defaultModel: null,
      theme: 'system',
      editor: 'vscode'
    };
    writeFileSync(join(LOCAL_PI_DIR, 'settings.json'), JSON.stringify(defaultSettings, null, 2));
  }

  // Configuration par défaut pour models.json
  if (!existsSync(join(LOCAL_PI_DIR, 'models.json'))) {
    const defaultModels = {
      providers: []
    };
    writeFileSync(join(LOCAL_PI_DIR, 'models.json'), JSON.stringify(defaultModels, null, 2));
  }

  // Fichier auth.json vide par défaut
  if (!existsSync(join(LOCAL_PI_DIR, 'auth.json'))) {
    writeFileSync(join(LOCAL_PI_DIR, 'auth.json'), JSON.stringify({}, null, 2));
  }
}

/**
 * Charge la configuration de Pi
 * @returns Chemin vers le répertoire de configuration de Pi
 */
export function loadPiConfig(): string {
  if (isPiInstalled()) {
    console.log('Utilisation de la configuration Pi de l\'utilisateur');
    return USER_PI_DIR;
  } else {
    console.log('Création d\'une configuration Pi locale');
    createLocalPiConfig();
    return LOCAL_PI_DIR;
  }
}

/**
 * Initialise Pi avec la configuration appropriée
 * @returns Chemin vers la configuration utilisée
 */
export function initializePi(): string {
  const configPath = loadPiConfig();
  
  // Ici, vous pourriez initialiser Pi avec la configuration chargée
  // Par exemple :
  // const pi = new Pi({ configPath });
  // await pi.start();
  
  return configPath;
}

/**
 * Récupère les modèles disponibles
 * @param configPath Chemin vers le répertoire de configuration de Pi
 * @returns Liste des modèles disponibles
 */
export function getAvailableModels(configPath: string): AvailableModel[] {
  try {
    const modelsConfig = JSON.parse(readFileSync(join(configPath, 'models.json'), 'utf-8')) as ModelsConfig;
    const models: AvailableModel[] = [];
    
    for (const provider of modelsConfig.providers) {
      for (const model of provider.models) {
        models.push({
          id: `${provider.id}/${model.id}`,
          name: model.name,
          provider: provider.name,
          capabilities: model.capabilities
        });
      }
    }
    
    return models;
  } catch (error) {
    console.error('Erreur lors de la lecture des modèles:', error);
    return [];
  }
}

/**
 * Récupère les paramètres de l'utilisateur
 * @param configPath Chemin vers le répertoire de configuration de Pi
 * @returns Paramètres de l'utilisateur
 */
export function getUserSettings(configPath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(configPath, 'settings.json'), 'utf-8'));
  } catch (error) {
    console.error('Erreur lors de la lecture des paramètres:', error);
    return {};
  }
}

/**
 * Met à jour les paramètres de l'utilisateur
 * @param configPath Chemin vers le répertoire de configuration de Pi
 * @param newSettings Nouveaux paramètres
 */
export function updateUserSettings(configPath: string, newSettings: Record<string, unknown>): void {
  try {
    const currentSettings = getUserSettings(configPath);
    const updatedSettings = { ...currentSettings, ...newSettings };
    writeFileSync(join(configPath, 'settings.json'), JSON.stringify(updatedSettings, null, 2));
  } catch (error) {
    console.error('Erreur lors de la mise à jour des paramètres:', error);
  }
}
