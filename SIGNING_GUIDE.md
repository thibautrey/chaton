# Guide de signature de code macOS pour Chaton

Ce guide explique comment configurer la signature de code et la notarization pour l'application Chaton sur macOS.

## Prérequis

1. **Compte développeur Apple** : Vous devez avoir un compte développeur Apple (gratuit ou payant)
2. **Certificats de signature** : Vous devez avoir créé les certificats nécessaires dans votre compte développeur
3. **Outils Apple** : XCode doit être installé (pour les outils de signature)

## Configuration

### 1. Créer les certificats nécessaires

Vous avez besoin de deux certificats :
- **Developer ID Application** : Pour signer l'application
- **Developer ID Installer** : Pour signer le package d'installation

Créez ces certificats dans [Apple Developer Center](https://developer.apple.com/account/resources/certificates/list).

### 2. Installer les certificats

Téléchargez et installez les certificats dans votre trousseau (Keychain Access).

### 3. Configurer les variables d'environnement

Créez un fichier `.env` à la racine du projet (ne pas commiter ce fichier) :

```bash
# .env
APPLE_TEAM_ID="VOTRE_TEAM_ID"  # Ex: ABCDE12345
APPLE_SIGNING_IDENTITY="Developer ID Application: Votre Nom (VOTRE_TEAM_ID)"

# Optionnel pour la notarization
APPLE_ID="votre@email.com"
APPLE_ID_PASSWORD="votre-mot-de-passe-app-specific"
```

**Note** : Pour `APPLE_ID_PASSWORD`, utilisez un mot de passe spécifique à l'application, pas votre mot de passe Apple ID principal.

### 4. Configurer le fichier de configuration

Modifiez `build/config.js` avec vos informations :

```javascript
export const buildConfig = {
  appleTeamId: "VOTRE_TEAM_ID",
  appleSigningIdentity: "Developer ID Application: Votre Nom (VOTRE_TEAM_ID)",
  appleId: "votre@email.com",
  appleIdPassword: "votre-mot-de-passe-app-specific"
};
```

## Build et signature

### Méthode 1: Utiliser le script bash

```bash
# Donner les permissions au script
chmod +x scripts/build-signed.sh

# Exécuter avec les variables d'environnement
APPLE_TEAM_ID="VOTRE_TEAM_ID" \
APPLE_SIGNING_IDENTITY="Developer ID Application: Votre Nom (VOTRE_TEAM_ID)" \
./scripts/build-signed.sh
```

### Méthode 2: Utiliser directement electron-builder

```bash
# Build l'application
npm run build

# Créer le package signé
electron-builder --mac dmg --publish never \
  --config.mac.identity="Developer ID Application: Votre Nom (VOTRE_TEAM_ID)" \
  --config.mac.hardenedRuntime=true \
  --config.mac.gatekeeperAssess=false \
  --config.mac.entitlements="build/entitlements.mac.plist" \
  --config.mac.entitlementsInherit="build/entitlements.mac.plist"
```

## Notarization

La notarization est configurée automatiquement si vous fournissez `APPLE_ID` et `APPLE_ID_PASSWORD`.

Pour tester la notarization manuellement :

```bash
electron-builder --mac dmg --publish never \
  --config.mac.identity="Developer ID Application: Votre Nom (VOTRE_TEAM_ID)" \
  --config.mac.hardenedRuntime=true \
  --config.mac.notarize=true \
  --config.mac.notarize.appBundleId="com.thibaut.chaton" \
  --config.mac.notarize.appleId="votre@email.com" \
  --config.mac.notarize.appleIdPassword="votre-mot-de-passe-app-specific"
```

## Dépannage

### Erreur: "notarize options were unable to be generated"

Cette erreur se produit lorsque les informations de notarization ne sont pas correctement configurées. Vérifiez :

1. Que vous avez bien défini `APPLE_ID` et `APPLE_ID_PASSWORD`
2. Que le mot de passe est un mot de passe spécifique à l'application
3. Que votre compte développeur a les droits nécessaires

### Erreur: "No identity found"

Vérifiez que :
1. Votre certificat est bien installé dans le trousseau
2. Le nom du certificat dans `APPLE_SIGNING_IDENTITY` est exact
3. Vous utilisez le bon Team ID

### Vérifier les certificats installés

```bash
security find-identity -v -p codesigning
```

### Tester la signature manuellement

```bash
# Signer l'application
codesign --deep --force --verify --verbose --sign "Developer ID Application: Votre Nom (VOTRE_TEAM_ID)" release/mac/Chaton.app

# Vérifier la signature
codesign --verify --deep --strict release/mac/Chaton.app
spctl -a -t exec -vv release/mac/Chaton.app
```

## Ressources

- [Apple Developer Documentation](https://developer.apple.com/documentation/security/notarizing_mac_software_before_distribution)
- [Electron Builder Documentation](https://www.electron.build/code-signing)
- [Creating App-Specific Passwords](https://support.apple.com/en-us/HT204397)