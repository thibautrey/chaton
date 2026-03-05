# Manual macOS Code Signing Instructions

If you cannot use the automated scripts, here is how to sign the application manually.

## Preparation

1. **Install required tools**:
   ```bash
   xcode-select --install
   ```

2. **Verify your certificates are installed**:
   ```bash
   security find-identity -v -p codesigning
   ```

## Build the Application

```bash
# Build the application
npm run build

# Create the unsigned package first
electron-builder --mac dmg --publish never
```

## Manual Signing

### 1. Sign the Main Application

```bash
# Replace with your signing identity
SIGNING_IDENTITY="Developer ID Application: Your Name (ABCDE12345)"

# Sign the application
codesign --deep --force --verify --verbose \
  --options runtime \
  --entitlements build/entitlements.mac.plist \
  --sign "$SIGNING_IDENTITY" \
  release/mac/Chatons.app

# Verify signature
codesign --verify --deep --strict release/mac/Chatons.app
spctl -a -t exec -vv release/mac/Chatons.app
```

### 2. Create the Signed DMG

```bash
# Remove old DMG if needed
rm -f release/Chatons-*.dmg

# Create a new DMG
# You can use electron-builder again or create it manually

electron-builder --mac dmg --publish never \
  --config.mac.identity="$SIGNING_IDENTITY"
```

## Manual Notarization

If you want to notarize manually:

```bash
# Notarize the application
xcrun altool --notarize-app \
  --primary-bundle-id "com.thibaut.chaton" \
  --username "your@email.com" \
  --password "your-app-specific-password" \
  --file release/Chatons-*.dmg

# Check notarization status (replace UUID with returned UUID)
xcrun altool --notarization-info UUID -u "your@email.com" -p "your-app-specific-password"

# Staple notarization ticket
xcrun stapler staple release/Chatons-*.dmg
```

## Final Verification

```bash
# Verify everything is properly signed and notarized
spctl -a -v -t install release/Chatons-*.dmg
codesign --verify --deep --strict release/Chatons-*.dmg
```

## Common Troubleshooting

### "code object is not signed at all"
Make sure you signed with the `--deep` option and that all binaries are signed.

### "resource fork, Finder information, or similar detritus not allowed"
Clean problematic file attributes:
```bash
xattr -cr release/mac/Chatons.app
```

### Entitlements issues
Verify your `entitlements.mac.plist` file is correct and that you are using it in the codesign command.

### Notarization fails
- Verify your Apple ID has notarization permissions
- Use an app-specific password
- Verify your bundle ID is correct
- Ensure the app is correctly signed before notarization
