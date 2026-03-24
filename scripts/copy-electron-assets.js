#!/usr/bin/env node

import { mkdir, cp } from 'node:fs/promises';

async function copyElectronAssets() {
  try {
    // Create directories
    await mkdir('dist-electron/electron/db/migrations', { recursive: true });
    await mkdir('dist-electron/build/icons', { recursive: true });
    await mkdir('dist-electron/packages/memory', { recursive: true });
    await mkdir('dist-electron/resources/npm', { recursive: true });
    
    // Copy files
    await cp('electron/db/migrations', 'dist-electron/electron/db/migrations', { 
      recursive: true, 
      force: true 
    });
    
    await cp('build/icons', 'dist-electron/build/icons', { 
      recursive: true, 
      force: true 
    });

    await cp('packages/memory', 'dist-electron/packages/memory', {
      recursive: true,
      force: true
    });

    // Keep npm outside app.asar so packaged builds can run install/update/publish flows.
    await cp('node_modules/npm', 'dist-electron/resources/npm', {
      recursive: true,
      force: true
    });

    // Keep the dedicated status bar icon in sync with packaged Electron assets.
    await cp('src/assets/statusbar.png', 'dist-electron/build/icons/statusbar.png', {
      force: true
    });

    // Copy pi-wrapper.sh
    await cp('electron/lib/pi/pi-wrapper.sh', 'dist-electron/lib/pi/pi-wrapper.sh', { 
      force: true 
    });

    // Copy builtin extension assets, including packaged dist bundles for React-backed UIs.
    await cp('electron/extensions/builtin', 'dist-electron/extensions/builtin', {
      recursive: true,
      force: true
    });
    
    console.log('Electron assets copied successfully');
  } catch (error) {
    console.error('Error copying electron assets:', error);
    process.exit(1);
  }
}

copyElectronAssets();
