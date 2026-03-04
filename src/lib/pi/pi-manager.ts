// src/lib/pi-manager.ts
// Gestionnaire principal pour Pi Coding Agent
// Ce module initialise Pi et le rend disponible pour l'application

import { homedir } from 'os';
import { initializePi, getAvailableModels, getUserSettings, updateUserSettings } from './pi-integration';

let piConfigPath: string | null = null;
let availableModels: any[] = [];
let userSettings: any = {};

/**
 * Initialise le gestionnaire Pi
 * @returns Promesse résolue une fois Pi initialisé
 */
export async function initPiManager(): Promise<void> {
  try {
    piConfigPath = initializePi();
    availableModels = getAvailableModels(piConfigPath);
    userSettings = getUserSettings(piConfigPath);
    
    console.log('Pi Manager initialisé avec succès');
    console.log(`Modèles disponibles: ${availableModels.length}`);
    console.log(`Paramètres utilisateur chargés`);
  } catch (error) {
    console.error('Erreur lors de l\'initialisation du Pi Manager:', error);
    throw error;
  }
}

/**
 * Récupère les modèles disponibles
 * @returns Liste des modèles disponibles
 */
export function getModels(): any[] {
  if (!piConfigPath) {
    throw new Error('Pi Manager non initialisé. Appelez initPiManager() d\'abord.');
  }
  return availableModels;
}

/**
 * Récupère les paramètres de l'utilisateur
 * @returns Paramètres de l'utilisateur
 */
export function getSettings(): any {
  if (!piConfigPath) {
    throw new Error('Pi Manager non initialisé. Appelez initPiManager() d\'abord.');
  }
  return userSettings;
}

/**
 * Met à jour les paramètres de l'utilisateur
 * @param newSettings Nouveaux paramètres
 */
export function updateSettings(newSettings: any): void {
  if (!piConfigPath) {
    throw new Error('Pi Manager non initialisé. Appelez initPiManager() d\'abord.');
  }
  updateUserSettings(piConfigPath, newSettings);
  userSettings = getUserSettings(piConfigPath);
}

/**
 * Récupère le chemin de configuration de Pi
 * @returns Chemin vers la configuration de Pi
 */
export function getConfigPath(): string {
  if (!piConfigPath) {
    throw new Error('Pi Manager non initialisé. Appelez initPiManager() d\'abord.');
  }
  return piConfigPath;
}

/**
 * Vérifie si Pi utilise la configuration de l'utilisateur
 * @returns true si la configuration de l'utilisateur est utilisée, false sinon
 */
export function isUsingUserConfig(): boolean {
  if (!piConfigPath) {
    return false;
  }
  return piConfigPath.includes(homedir());
}
