#!/usr/bin/env node

import { mkdir, cp } from 'node:fs/promises';
import { join } from 'node:path';

async function copyElectronAssets() {
  try {
    // Create directories
    await mkdir('dist-electron/db/migrations', { recursive: true });
    await mkdir('dist-electron/build/icons', { recursive: true });
    
    // Copy files
    await cp('electron/db/migrations', 'dist-electron/db/migrations', { 
      recursive: true, 
      force: true 
    });
    
    await cp('build/icons', 'dist-electron/build/icons', { 
      recursive: true, 
      force: true 
    });

    // Copy pi-wrapper.sh
    await cp('electron/lib/pi/pi-wrapper.sh', 'dist-electron/lib/pi/pi-wrapper.sh', { 
      force: true 
    });
    
    console.log('Electron assets copied successfully');
  } catch (error) {
    console.error('Error copying electron assets:', error);
    process.exit(1);
  }
}

copyElectronAssets();
