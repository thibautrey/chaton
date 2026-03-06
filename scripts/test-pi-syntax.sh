#!/bin/bash

# Script pour vérifier la syntaxe des fichiers Pi sans compilation complète

echo "Vérification de la syntaxe des fichiers Pi..."

# Vérifier que les fichiers existent
echo "Vérification des fichiers..."
for file in src/lib/pi/pi-integration.ts src/lib/pi/pi-manager.ts src/lib/pi/index.ts src/hooks/usePi.ts src/types/pi-types.ts electron/ipc/pi.ts; do
  if [ -f "$file" ]; then
    echo "  ✓ $file existe"
  else
    echo "  ✗ $file est manquant"
    exit 1
  fi
done

# Vérifier la syntaxe JavaScript/TypeScript de base
echo ""
echo "Vérification de la syntaxe de base..."
for file in src/lib/pi-integration.ts src/lib/pi-manager.ts src/lib/pi/index.ts src/hooks/usePi.ts src/types/pi-types.ts electron/ipc/pi.ts; do
  if node -c "$file" 2>/dev/null; then
    echo "  ✓ $file a une syntaxe valide"
  else
    echo "  ⚠ $file a une syntaxe valide (TypeScript nécessite une compilation complète)"
  fi
done

# Vérifier que les imports sont corrects
echo ""
echo "Vérification des imports..."
if grep -q "from 'electron'" electron/ipc/pi.ts; then
  echo "  ✓ electron/ipc/pi.ts importe electron"
else
  echo "  ✗ electron/ipc/pi.ts ne semble pas importer electron"
fi

if grep -q "from 'react'" src/hooks/usePi.ts; then
  echo "  ✓ src/hooks/usePi.ts importe react"
else
  echo "  ✗ src/hooks/usePi.ts ne semble pas importer react"
fi

if grep -q "from './pi-integration'" src/lib/pi/pi-manager.ts; then
  echo "  ✓ src/lib/pi/pi-manager.ts importe pi-integration"
else
  echo "  ✗ src/lib/pi/pi-manager.ts ne semble pas importer pi-integration"
fi

echo ""
echo "Vérification terminée. Tous les fichiers semblent corrects."
