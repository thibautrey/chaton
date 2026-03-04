# Intégration de Pi Coding Agent

Ce document décrit comment Pi Coding Agent est intégré dans l'application Chaton Native.

## Aperçu

L'application peut maintenant utiliser Pi Coding Agent de deux manières :

1. **Mode utilisateur** : Si Pi est déjà installé sur la machine de l'utilisateur, l'application utilisera automatiquement la configuration existante.
2. **Mode embarqué** : Par défaut, l'application utilise une configuration locale embarquée sans dépendre d'une installation externe de Pi.

## Structure des fichiers

```
src/
├── lib/
│   ├── pi/
│   │   ├── pi-integration.ts  # Logique d'intégration de Pi
│   │   ├── pi-manager.ts      # Gestionnaire principal de Pi
│   │   ├── index.ts            # Point d'entrée pour les exports
│   │   └── test.ts            # Tests d'intégration
│   └── pi-integration.ts      # (Lien symbolique vers pi/pi-integration.ts)
│   └── pi-manager.ts          # (Lien symbolique vers pi/pi-manager.ts)
├── hooks/
│   └── usePi.ts              # Hook React pour utiliser Pi
├── types/
│   └── pi-types.ts           # Types TypeScript pour Pi
├── components/
│   └── PiSettings.tsx        # Composant UI pour les paramètres de Pi
└── examples/
    └── PiSettingsPage.tsx    # Exemple de page utilisant PiSettings

electron/
├── ipc/
│   └── pi.ts                 # Handlers IPC pour Pi
└── preload.ts                # Exposition des méthodes Pi au frontend
```

## Fonctionnalités

### 1. Détection automatique de Pi

Le système détecte automatiquement si Pi est installé sur la machine de l'utilisateur. Si Pi n'est pas trouvé, l'application utilise sa propre configuration embarquée.

### 2. Configuration locale

Si Pi n'est pas installé, une configuration locale est créée avec :
- `settings.json` : Paramètres par défaut
- `models.json` : Liste des modèles par défaut
- `auth.json` : Fichier vide pour les informations d'authentification

### 3. Gestion des modèles

L'application peut :
- Lister les modèles disponibles
- Activer/désactiver des modèles
- Définir un modèle par défaut

### 4. Gestion des paramètres

L'application peut :
- Lire les paramètres de l'utilisateur
- Mettre à jour les paramètres
- Détecter si la configuration de l'utilisateur est utilisée

## Utilisation

### Dans les composants React

```typescript
import { usePi } from '../hooks/usePi';

function MyComponent() {
  const { models, settings, isUsingUserConfig, updateSettings } = usePi();

  // Utiliser les données de Pi
  return (
    <div>
      <h2>Modèles disponibles</h2>
      <ul>
        {models.map(model => (
          <li key={model.id}>{model.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Dans le backend Electron

```typescript
import { initPiManager, getModels, getSettings } from '../src/lib/pi-manager';

// Initialiser Pi au démarrage
async function initializeApp() {
  await initPiManager();
  
  const models = getModels();
  const settings = getSettings();
  
  console.log('Modèles disponibles:', models);
  console.log('Paramètres:', settings);
}
```

## Configuration

### Fichiers de configuration

#### settings.json

```json
{
  "enabledModels": ["openai-codex/gpt-5.3-codex"],
  "defaultModel": "openai-codex/gpt-5.3-codex",
  "theme": "system",
  "editor": "vscode"
}
```

#### models.json

```json
{
  "providers": [
    {
      "id": "openai-codex",
      "name": "OpenAI Codex",
      "models": [
        {
          "id": "gpt-5.3-codex",
          "name": "GPT-5.3 Codex",
          "capabilities": ["chat", "code"]
        }
      ]
    }
  ]
}
```

## Tests

Pour vérifier que l'intégration fonctionne correctement :

```bash
./test-pi-syntax.sh
```

Ce script vérifie :
- L'existence de tous les fichiers nécessaires
- La syntaxe de base des fichiers
- La présence des imports nécessaires

## Avantages

1. **Flexibilité** : L'application fonctionne avec ou sans installation préalable de Pi.
2. **Portabilité** : La configuration locale permet à l'application de fonctionner sur n'importe quelle machine.
3. **Personnalisation** : Les utilisateurs peuvent réutiliser leur configuration Pi existante.
4. **Maintenabilité** : Le code est bien structuré et facile à maintenir.

## Prochaines étapes

1. Intégrer le composant `PiSettings` dans l'interface utilisateur principale.
2. Utiliser les modèles et paramètres de Pi dans les fonctionnalités existantes.
3. Ajouter des tests unitaires et d'intégration plus complets.
4. Documenter les API supplémentaires de Pi qui pourraient être exposées.
