#!/bin/bash

# Script pour builder et signer l'application macOS
# Nécessite que les variables d'environnement suivantes soient définies:
# - APPLE_TEAM_ID: Votre Team ID Apple (ex: ABCDE12345)
# - APPLE_SIGNING_IDENTITY: Nom du certificat de signature (ex: "Developer ID Application: Votre Nom (ABCDE12345)")
# - CSC_NAME: Même que APPLE_SIGNING_IDENTITY
# - CSC_LINK (optionnel): Chemin vers un certificat .p12 si vous utilisez un certificat fichier
# - APPLE_ID (optionnel): Votre Apple ID pour la notarization
# - APPLE_ID_PASSWORD (optionnel): Mot de passe pour la notarization

set -e

echo "Building signed application..."

# Vérifier les variables d'environnement nécessaires
if [ -z "$APPLE_TEAM_ID" ]; then
  echo "Error: APPLE_TEAM_ID environment variable not set"
  exit 1
fi

if [ -z "$APPLE_SIGNING_IDENTITY" ]; then
  echo "Error: APPLE_SIGNING_IDENTITY environment variable not set"
  exit 1
fi

echo "Using Team ID: $APPLE_TEAM_ID"
echo "Using Signing Identity: $APPLE_SIGNING_IDENTITY"

# Exporter les variables pour electron-builder
export CSC_NAME="$APPLE_SIGNING_IDENTITY"
export CSC_LINK="${CSC_LINK:-}"
export APPLE_ID="${APPLE_ID:-}"
export APPLE_ID_PASSWORD="${APPLE_ID_PASSWORD:-}"

# Builder l'application
echo "Running build..."
npm run build

# Créer le package signé
echo "Creating signed package..."
electron-builder --mac dmg --publish never \
  --config.mac.identity="$APPLE_SIGNING_IDENTITY" \
  --config.mac.hardenedRuntime=true \
  --config.mac.gatekeeperAssess=false \
  --config.mac.entitlements="build/entitlements.mac.plist" \
  --config.mac.entitlementsInherit="build/entitlements.mac.plist"

echo "Build completed successfully!"