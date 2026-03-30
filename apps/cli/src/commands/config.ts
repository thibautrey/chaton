/**
 * config command - Configure CLI settings
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensurePiAgentDir, getPiAgentDir, isConfigured } from '../session.js';

export async function configCommand(): Promise<void> {
  console.log('Chatons CLI Configuration\n');
  console.log('─'.repeat(50));
  
  // Check if already configured
  if (isConfigured()) {
    console.log('✓ CLI is already configured.');
    console.log(`  Config directory: ${getPiAgentDir()}`);
    console.log('');
    console.log('To add providers, use the Chatons desktop app.');
    console.log('The CLI shares configuration with the desktop app.');
    return;
  }
  
  console.log('CLI is not configured yet.');
  console.log('');
  console.log('Options to initialize:');
  console.log('');
  console.log('  1. Run the Chatons desktop app and configure your providers');
  console.log('     there. The CLI will automatically use the same config.');
  console.log('');
  console.log('  2. Manually create config files in:');
  console.log(`     ${getPiAgentDir()}`);
  console.log('');
  console.log('  Required files:');
  console.log('    - models.json  (provider definitions)');
  console.log('    - auth.json    (API keys)');
  console.log('    - settings.json (preferences)');
  console.log('');
  
  // Create directory structure
  ensurePiAgentDir();
  console.log(`✓ Created config directory: ${getPiAgentDir()}`);
  console.log('');
  console.log('Once you have configured providers, run "chatons models" to verify.');
}
