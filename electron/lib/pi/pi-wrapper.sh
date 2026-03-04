#!/bin/bash
set -euo pipefail

# Utiliser le Node.js d'Electron
ELECTRON_NODE="ELECTRON_NODE_PLACEHOLDER"

# Définir les variables pour contourner les problèmes de npm global
# Utiliser les chemins de l'installation utilisateur existante si disponible
USER_PI_ROOT="$HOME/.nvm/versions/node/v22.20.0/lib/node_modules"
BUNDLED_PI_ROOT="BUNDLED_PI_ROOT_PLACEHOLDER"

# Vérifier si l'installation utilisateur existe, sinon utiliser la version bundlée
if [[ -d "$USER_PI_ROOT" ]]; then
  export PI_ROOT="$USER_PI_ROOT"
else
  export PI_ROOT="$BUNDLED_PI_ROOT"
fi

export PI_CLI="$PI_ROOT/@mariozechner/pi-coding-agent/dist/cli.js"
export PI_AI_OPENAI_COMPLETIONS="$PI_ROOT/@mariozechner/pi-coding-agent/node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js"
export PATCH_SCRIPT="$HOME/.pi/agent/patches/apply-qwen3-patch.sh"
export PATCH_MARKER="_qwen3SanitizeDesc"

# Désactiver les vérifications npm globales qui échouent
# en définissant un cache npm factice et en mockant les commandes npm
TEMP_DIR_PLACEHOLDER="TEMP_DIR_TO_REPLACE"
export npm_config_cache="$TEMP_DIR_PLACEHOLDER"
export npm_config_global_prefix="$TEMP_DIR_PLACEHOLDER"
export npm_config_prefix="$TEMP_DIR_PLACEHOLDER"

# Créer un environnement npm minimal pour satisfaire les exigences du Pi agent
# Créer une structure de répertoire npm globale factice
mkdir -p "$TEMP_DIR_PLACEHOLDER/lib/node_modules"
mkdir -p "$TEMP_DIR_PLACEHOLDER/bin"

# Créer un package.json minimal
cat > "$TEMP_DIR_PLACEHOLDER/package.json" << 'EOF'
{
  "name": "fake-global-npm",
  "version": "1.0.0",
  "private": true
}
EOF

# Créer un faux binaire npm qui simule les commandes nécessaires
NPM_MOCK_SCRIPT="$TEMP_DIR_PLACEHOLDER/bin/npm"
cat > "$NPM_MOCK_SCRIPT" << EOF
#!/bin/bash

# Analyser les arguments
case "$1" in
  "root")
    if [[ "${2:-}" == "-g" ]]; then
      echo "$TEMP_DIR_PLACEHOLDER"
      exit 0
    fi
    ;;
  "list")
    if [[ "${2:-}" == "-g" ]]; then
      echo "{}"
      exit 0
    fi
    ;;
  "config")
    if [[ "${2:-}" == "get" && "${3:-}" == "prefix" ]]; then
      echo "$TEMP_DIR_PLACEHOLDER"
      exit 0
    fi
    ;;
  *)
    # Pour les autres commandes, retourner une valeur par défaut
    echo "{}"
    exit 0
    ;;
esac

exit 0
EOF
chmod +x "$NPM_MOCK_SCRIPT"

# Créer un faux binaire node qui utilise Electron's Node.js
NODE_MOCK_SCRIPT="$TEMP_DIR_PLACEHOLDER/bin/node"
cat > "$NODE_MOCK_SCRIPT" << EOF
#!/bin/bash
exec "$ELECTRON_NODE" "$@"
EOF
chmod +x "$NODE_MOCK_SCRIPT"

# Configurer l'environnement pour utiliser notre faux npm global
export PATH="$TEMP_DIR_PLACEHOLDER/bin:$PATH"
export NODE_PATH="$PI_ROOT:$TEMP_DIR_PLACEHOLDER/lib/node_modules"
export npm_config_global_prefix="$TEMP_DIR_PLACEHOLDER"
export npm_config_prefix="$TEMP_DIR_PLACEHOLDER"
export npm_config_cache="$TEMP_DIR_PLACEHOLDER/cache"
export npm_config_registry="https://registry.npmjs.org/"

# Variables pour désactiver les vérifications de mise à jour
export npm_config_update_notifier=false
export npm_config_fund=false
export npm_config_audit=false

# Patch à la demande (même logique que le script original)
if [[ -f "$PI_AI_OPENAI_COMPLETIONS" ]] && ! grep -q "$PATCH_MARKER" "$PI_AI_OPENAI_COMPLETIONS"; then
  if [[ -x "$PATCH_SCRIPT" ]]; then
    if ! "$PATCH_SCRIPT" >/dev/null 2>&1; then
      echo "[pi-wrapper] Échec du patch Qwen3 automatique (exécution de pi maintenue)." >&2
    fi
  else
    echo "[pi-wrapper] Script de patch introuvable ou non exécutable: $PATCH_SCRIPT" >&2
  fi
fi

# Exécuter avec Electron's Node.js
NODE_OPTIONS="--no-warnings" "$ELECTRON_NODE" "$PI_CLI" "$@"
