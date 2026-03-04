#!/usr/bin/env node

import { execSync } from 'child_process';
import { buildConfig } from '../build/config.js';
import dotenv from 'dotenv';

// Charger les variables d'environnement depuis .env si présent
try {
  dotenv.config();
} catch (e) {
  // Ignorer si pas de fichier .env
}

console.log('Building signed application...');

// Vérifier que les informations de signature sont présentes
if (!buildConfig.appleSigningIdentity) {
  console.error('Error: Apple signing identity not configured.');
  console.error('Please set APPLE_SIGNING_IDENTITY environment variable or configure build/config.js');
  process.exit(1);
}

if (!buildConfig.appleTeamId) {
  console.error('Error: Apple Team ID not configured.');
  console.error('Please set APPLE_TEAM_ID environment variable or configure build/config.js');
  process.exit(1);
}

console.log(`Using Team ID: ${buildConfig.appleTeamId}`);
console.log(`Using Signing Identity: ${buildConfig.appleSigningIdentity}`);

// Construire l'application avec signature
try {
  console.log('Running build...');
  execSync('npm run build', { stdio: 'inherit' });
  
  console.log('Creating signed package...');
  const env = {
    ...process.env,
    APPLE_TEAM_ID: buildConfig.appleTeamId,
    APPLE_SIGNING_IDENTITY: buildConfig.appleSigningIdentity,
    CSC_NAME: buildConfig.appleSigningIdentity,
    CSC_LINK: process.env.CSC_LINK, // Pour les certificats depuis un fichier
    APPLE_ID: buildConfig.appleId,
    APPLE_ID_PASSWORD: buildConfig.appleIdPassword
  };
  
  execSync('electron-builder --mac dmg --publish never', {
    stdio: 'inherit',
    env: env
  });
  
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}