/**
 * Session manager for CLI - handles Pi runtime sessions
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Get the Pi agent directory path
 */
export function getPiAgentDir(): string {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'chatons', '.pi', 'agent');
}

/**
 * Get the sessions directory
 */
export function getSessionsDir(): string {
  return path.join(getPiAgentDir(), 'sessions');
}

/**
 * Get the models config path
 */
export function getModelsConfigPath(): string {
  return path.join(getPiAgentDir(), 'models.json');
}

/**
 * Get the auth config path
 */
export function getAuthConfigPath(): string {
  return path.join(getPiAgentDir(), 'auth.json');
}

/**
 * Get the settings config path
 */
export function getSettingsConfigPath(): string {
  return path.join(getPiAgentDir(), 'settings.json');
}

/**
 * Ensure the Pi agent directory structure exists
 */
export function ensurePiAgentDir(): void {
  const dirs = [
    getPiAgentDir(),
    getSessionsDir(),
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Check if the CLI is configured (has at least one model)
 */
export function isConfigured(): boolean {
  try {
    const modelsPath = getModelsConfigPath();
    if (!fs.existsSync(modelsPath)) {
      return false;
    }
    
    const modelsConfig = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
    return modelsConfig.providers && Object.keys(modelsConfig.providers).length > 0;
  } catch {
    return false;
  }
}

/**
 * Get available models from config
 */
export function getAvailableModels(): Array<{ provider: string; id: string; name: string }> {
  try {
    const modelsPath = getModelsConfigPath();
    if (!fs.existsSync(modelsPath)) {
      return [];
    }
    
    const modelsConfig = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
    const models: Array<{ provider: string; id: string; name: string }> = [];
    
    if (modelsConfig.providers) {
      for (const [providerName, provider] of Object.entries(modelsConfig.providers)) {
        const p = provider as { models?: Array<{ id: string; name?: string }> };
        if (p.models) {
          for (const model of p.models) {
            models.push({
              provider: providerName,
              id: model.id,
              name: model.name || model.id,
            });
          }
        }
      }
    }
    
    return models;
  } catch {
    return [];
  }
}

/**
 * Get the default model from settings
 */
export function getDefaultModel(): { provider: string; id: string } | null {
  try {
    const settingsPath = getSettingsConfigPath();
    if (!fs.existsSync(settingsPath)) {
      return null;
    }
    
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (settings.defaultModel && settings.defaultProvider) {
      return {
        provider: settings.defaultProvider,
        id: settings.defaultModel,
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Types for session file
 */
export type PiSessionData = {
  id: string;
  name: string;
  cwd: string;
  model?: { provider: string; id: string };
  thinkingLevel?: string;
  createdAt: string;
  updatedAt: string;
  messages?: unknown[];
};
