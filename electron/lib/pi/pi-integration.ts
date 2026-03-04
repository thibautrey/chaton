// electron/lib/pi/pi-integration.ts
// Intégration avec Pi Coding Agent - Version Electron

import { execSync } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import fs from 'fs';

/**
 * Initialise Pi Coding Agent
 * @returns Chemin vers la configuration de Pi
 */
export function initializePi(): string {
  try {
    // Vérifier si Pi est disponible
    const piPath = path.join(homedir(), '.pi', 'agent', 'bin', 'pi');
    
    if (!fs.existsSync(piPath)) {
      throw new Error('Pi Coding Agent non trouvé. Veuillez l\'installer d\'abord.');
    }
    
    // Récupérer le chemin de configuration
    const configPath = path.join(homedir(), '.pi', 'agent');
    return configPath;
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
    // Exécuter la commande pour lister les modèles
    const result = execSync('~/.pi/agent/bin/pi --list-models', {
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${path.join(homedir(), '.pi', 'agent', 'bin')}:${process.env.PATH}` }
    });
    
    const models = JSON.parse(result);
    return models;
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
