/**
 * models command - List available models
 */

import { getAvailableModels, getDefaultModel, isConfigured } from '../session.js';

interface ModelsCommandOptions {
  json?: boolean;
}

export async function modelsCommand(options: ModelsCommandOptions): Promise<void> {
  if (!isConfigured()) {
    console.error('Error: CLI is not configured. Run "chatons config init" first.');
    console.error('');
    console.error('You need to either:');
    console.error('  1. Copy config from desktop app (~/.config/chatons/.pi/)');
    console.error('  2. Set up providers in the desktop app first');
    process.exit(1);
  }
  
  const models = getAvailableModels();
  const defaultModel = getDefaultModel();
  
  if (models.length === 0) {
    if (options.json) {
      console.log(JSON.stringify([], null, 2));
    } else {
      console.log('No models configured.');
    }
    return;
  }
  
  // Group by provider
  const byProvider: Record<string, typeof models> = {};
  for (const model of models) {
    if (!byProvider[model.provider]) {
      byProvider[model.provider] = [];
    }
    byProvider[model.provider].push(model);
  }
  
  if (options.json) {
    console.log(JSON.stringify(models, null, 2));
  } else {
    console.log(`\nAvailable Models:\n`);
    
    for (const [provider, providerModels] of Object.entries(byProvider)) {
      console.log(`  ${provider}:`);
      for (const model of providerModels) {
        const isDefault = defaultModel?.provider === provider && defaultModel?.id === model.id;
        const marker = isDefault ? ' (default)' : '';
        console.log(`    - ${model.id}${marker}`);
      }
      console.log('');
    }
  }
}
