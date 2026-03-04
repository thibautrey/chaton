#!/bin/bash

# Script pour tester l'intégration de Pi

echo "Test de l'intégration de Pi..."

# Vérifier que les fichiers existent
echo "Vérification des fichiers..."
for file in src/lib/pi-integration.ts src/lib/pi-manager.ts src/lib/pi/index.ts src/hooks/usePi.ts src/types/pi-types.ts electron/ipc/pi.ts; do
  if [ -f "$file" ]; then
    echo "  ✓ $file existe"
  else
    echo "  ✗ $file est manquant"
    exit 1
  fi
done

# Compiler les fichiers TypeScript
echo ""
echo "Compilation des fichiers TypeScript..."
npx tsc --noEmit src/lib/pi-integration.ts src/lib/pi-manager.ts src/lib/pi/index.ts src/hooks/usePi.ts src/types/pi-types.ts electron/ipc/pi.ts

if [ $? -eq 0 ]; then
  echo "  ✓ Compilation réussie"
else
  echo "  ✗ Erreurs de compilation"
  exit 1
fi

# Exécuter le test
echo ""
echo "Exécution du test..."
npx ts-node src/lib/pi/test.ts

echo ""
echo "Test terminé."
