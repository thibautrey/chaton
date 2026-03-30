/**
 * new command - Create a new conversation
 */

import crypto from 'node:crypto';
import { getDb, insertConversation, findProjectById } from '../db.js';
import { ensurePiAgentDir, getSessionsDir, getSettingsConfigPath } from '../session.js';
import fs from 'node:fs';
import path from 'node:path';

interface NewCommandOptions {
  project?: string;
  model?: string;
}

export async function newCommand(title: string, options: NewCommandOptions): Promise<void> {
  // Ensure directories exist
  ensurePiAgentDir();
  
  const db = getDb();
  
  // Validate project if provided
  if (options.project) {
    const project = findProjectById(db, options.project);
    if (!project) {
      console.error(`Error: Project '${options.project}' not found.`);
      process.exit(1);
    }
  }
  
  // Parse model if provided
  let modelProvider: string | null = null;
  let modelId: string | null = null;
  
  if (options.model) {
    const parts = options.model.split('/');
    if (parts.length === 2) {
      modelProvider = parts[0];
      modelId = parts[1];
    } else {
      console.error('Error: Model must be in format "provider/modelId"');
      process.exit(1);
    }
  } else {
    // Try to get default model from settings
    try {
      const settingsPath = getSettingsConfigPath();
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (settings.defaultModel && settings.defaultProvider) {
          modelProvider = settings.defaultProvider;
          modelId = settings.defaultModel;
        }
      }
    } catch {
      // Ignore errors, use no default model
    }
  }
  
  // Generate conversation ID and session file path
  const conversationId = crypto.randomUUID();
  const sessionsDir = getSessionsDir();
  
  // Create conversation
  insertConversation(db, {
    id: conversationId,
    title,
    titleSource: 'placeholder',
    projectId: options.project || null,
    modelProvider,
    modelId,
    runtimeLocation: 'local',
  });
  
  console.log(`✓ Conversation created`);
  console.log(`  ID:    ${conversationId}`);
  console.log(`  Title: ${title}`);
  if (options.project) {
    console.log(`  Project: ${options.project}`);
  }
  if (modelProvider && modelId) {
    console.log(`  Model: ${modelProvider}/${modelId}`);
  }
  console.log('');
  console.log(`To start chatting, run:`);
  console.log(`  chatons repl ${conversationId}`);
}
