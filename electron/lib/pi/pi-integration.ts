// electron/lib/pi/pi-integration.ts
// Intégration avec Pi Coding Agent - Version Electron

import { execSync } from 'child_process';
import { homedir } from 'os';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * Initialise Pi Coding Agent
 * @returns Chemin vers la configuration de Pi
 */
export function initializePi(): string {
  try {
    // Vérifier si Pi est disponible en externe (utilisateur)
    const userPiPath = path.join(homedir(), '.pi', 'agent', 'bin', 'pi');
    
    if (fs.existsSync(userPiPath)) {
      // Utiliser la configuration utilisateur si disponible
      console.log('Utilisation de la configuration Pi utilisateur');
      return path.join(homedir(), '.pi', 'agent');
    }
    
    // Sinon, utiliser la configuration locale embarquée
    console.log('Utilisation de la configuration Pi locale embarquée');
    const localPiPath = path.join(app.getAppPath(), '.pi', 'agent');
    
    // Créer le répertoire local s'il n'existe pas
    if (!fs.existsSync(localPiPath)) {
      fs.mkdirSync(localPiPath, { recursive: true });
    }
    
    return localPiPath;
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
    // Déterminer le chemin vers l'exécutable Pi
    let piBinaryPath = '';
    let piCommand = '';
    
    if (configPath.includes(homedir())) {
      // Utiliser Pi utilisateur
      piBinaryPath = path.join(homedir(), '.pi', 'agent', 'bin');
      piCommand = path.join(piBinaryPath, 'pi');
    } else {
      // Utiliser Pi local
      piBinaryPath = path.join(app.getAppPath(), '.pi', 'agent', 'bin');
      piCommand = path.join(piBinaryPath, 'pi');
    }
    
    // Vérifier si l'exécutable existe
    if (!fs.existsSync(piCommand)) {
      console.log('Aucun binaire Pi trouvé, retour d\'une liste vide');
      return [];
    }
    
    // Exécuter la commande pour lister les modèles
    const result = execSync(`${piCommand} --list-models`, {
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${piBinaryPath}:${process.env.PATH}` }
    });

    return parsePiListModelsOutput(result);
  } catch (error) {
    console.error('Erreur lors de la récupération des modèles:', error);
    return [];
  }
}

function parsePiListModelsOutput(raw: string): Array<{
  id: string
  name: string
  provider: string
  capabilities: string[]
}> {
  const trimmed = raw.trim()
  if (!trimmed) {
    return []
  }

  // Compat: certains environnements pourraient renvoyer du JSON.
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      // fallback text parsing
    }
  }

  const lines = raw
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.startsWith('Failed to load extension '))

  if (lines.length === 0) {
    return []
  }

  const headerIndex = lines.findIndex((line) => line.includes('provider') && line.includes('model'))
  if (headerIndex < 0) {
    return []
  }

  return lines
    .slice(headerIndex + 1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean)
      if (parts.length < 2) {
        return null
      }

      const provider = parts[0]
      const model = parts[1]
      const thinking = parts[4]?.toLowerCase() === 'yes'
      const images = parts[5]?.toLowerCase() === 'yes'
      const capabilities = ['chat', 'code']

      if (thinking) {
        capabilities.push('thinking')
      }
      if (images) {
        capabilities.push('images')
      }

      return {
        id: `${provider}/${model}`,
        name: model,
        provider,
        capabilities,
      }
    })
    .filter((item): item is { id: string; name: string; provider: string; capabilities: string[] } => item !== null)
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
