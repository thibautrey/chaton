# Instructions manuelles pour la signature de code macOS

Si vous ne pouvez pas utiliser les scripts automatiques, voici comment signer manuellement l'application.

## Préparation

1. **Installez les outils nécessaires** :
   ```bash
   xcode-select --install
   ```

2. **Vérifiez que vos certificats sont installés** :
   ```bash
   security find-identity -v -p codesigning
   ```

## Build de l'application

```bash
# Build l'application
npm run build

# Créer le package non signé d'abord
electron-builder --mac dmg --publish never
```

## Signature manuelle

### 1. Signer l'application principale

```bash
# Remplacez par votre identité de signature
SIGNING_IDENTITY="Developer ID Application: Votre Nom (ABCDE12345)"

# Signer l'application
codesign --deep --force --verify --verbose \
  --options runtime \
  --entitlements build/entitlements.mac.plist \
  --sign "$SIGNING_IDENTITY" \
  release/mac/Chaton.app

# Vérifier la signature
codesign --verify --deep --strict release/mac/Chaton.app
spctl -a -t exec -vv release/mac/Chaton.app
```

### 2. Créer le DMG signé

```bash
# Supprimer l'ancien DMG si nécessaire
rm -f release/Chaton-*.dmg

# Créer un nouveau DMG
# Vous pouvez utiliser electron-builder à nouveau ou créer manuellement

electron-builder --mac dmg --publish never \
  --config.mac.identity="$SIGNING_IDENTITY"
```

## Notarization manuelle

Si vous voulez notarizer manuellement :

```bash
# Notarize l'application
xcrun altool --notarize-app \
  --primary-bundle-id "com.thibaut.chaton" \
  --username "votre@email.com" \
  --password "votre-mot-de-passe-app-specific" \
  --file release/Chaton-*.dmg

# Vérifier le status de notarization (remplacez UUID par l'UUID retourné)
xcrun altool --notarization-info UUID -u "votre@email.com" -p "votre-mot-de-passe-app-specific"

# Stapler le ticket de notarization
xcrun stapler staple release/Chaton-*.dmg
```

## Vérification finale

```bash
# Vérifier que tout est correctement signé et notarized
spctl -a -v -t install release/Chaton-*.dmg
codesign --verify --deep --strict release/Chaton-*.dmg
```

## Résolution des problèmes courants

### "code object is not signed at all"
Vérifiez que vous avez bien signé avec l'option `--deep` et que tous les binaires sont signés.

### "resource fork, Finder information, or similar detritus not allowed"
Nettoyez les fichiers problématiques :
```bash
xattr -cr release/mac/Chaton.app
```

### Problèmes avec les entitlements
Vérifiez que votre fichier `entitlements.mac.plist` est correct et que vous l'utilisez dans la commande codesign.

### La notarization échoue
- Vérifiez que votre Apple ID a les droits de notarization
- Utilisez un mot de passe spécifique à l'application
- Vérifiez que votre bundle ID est correct
- Assurez-vous que l'application est correctement signée avant la notarization