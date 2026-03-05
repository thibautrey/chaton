#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config();

const env = { ...process.env };
const signingIdentity = env.APPLE_SIGNING_IDENTITY || env.CSC_NAME;
const teamId = env.APPLE_TEAM_ID;

if (!signingIdentity) {
  console.error('Error: missing signing identity for production DMG.');
  console.error('Set APPLE_SIGNING_IDENTITY (or CSC_NAME) to your "Developer ID Application" certificate.');
  console.error('Example: APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID1234)" npm run package:prod:dmg');
  process.exit(1);
}

if (!teamId) {
  console.error('Error: missing APPLE_TEAM_ID for production DMG.');
  console.error('Example: APPLE_TEAM_ID="TEAMID1234" APPLE_SIGNING_IDENTITY="Developer ID Application: ..." npm run package:prod:dmg');
  process.exit(1);
}

const appSpecificPassword = env.APPLE_APP_SPECIFIC_PASSWORD || env.APPLE_ID_PASSWORD;
const hasAppleIdNotary = Boolean(env.APPLE_ID && appSpecificPassword);
const hasApiKeyNotary = Boolean(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER);
const notarize = hasAppleIdNotary || hasApiKeyNotary;

if (!notarize) {
  console.error('Error: missing notarization credentials for production DMG.');
  console.error('Provide either:');
  console.error('  1) APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD (or APPLE_ID_PASSWORD), or');
  console.error('  2) APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER');
  process.exit(1);
}

const run = (command, args, extraEnv = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...env, ...extraEnv }
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

console.log('Building renderer/main...');
run('npm', ['run', 'build']);

console.log('Packaging signed DMG...');
const builderArgs = [
  'electron-builder',
  '--mac',
  'dmg',
  '--publish',
  'never',
  '--config.mac.identity=' + signingIdentity,
  '--config.mac.hardenedRuntime=true',
  '--config.mac.entitlements=build/entitlements.mac.plist',
  '--config.mac.entitlementsInherit=build/entitlements.mac.plist',
  '--config.mac.notarize=' + String(notarize)
];

run('npx', builderArgs, {
  CSC_NAME: signingIdentity,
  APPLE_TEAM_ID: teamId,
  APPLE_APP_SPECIFIC_PASSWORD: appSpecificPassword
});

console.log('Done. Validate with:');
console.log('  codesign -dv --verbose=4 release/mac-arm64/Chatons.app');
console.log('  spctl --assess --type execute --verbose=4 release/mac-arm64/Chatons.app');
