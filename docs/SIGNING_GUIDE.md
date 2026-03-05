# macOS Code Signing Guide for Chatons

This guide explains how to configure code signing and notarization for the Chatons application on macOS.

## Prerequisites

1. **Apple Developer account**: You must have an Apple Developer account (free or paid)
2. **Signing certificates**: You must create the required certificates in your developer account
3. **Apple tools**: Xcode must be installed (for signing tools)

## Configuration

### 1. Create Required Certificates

You need two certificates:
- **Developer ID Application**: To sign the application
- **Developer ID Installer**: To sign the installer package

Create these certificates in the [Apple Developer Center](https://developer.apple.com/account/resources/certificates/list).

### 2. Install Certificates

Download and install the certificates in your keychain (Keychain Access).

### 3. Configure Environment Variables

Create a `.env` file at the project root (do not commit this file):

```bash
# .env
APPLE_TEAM_ID="YOUR_TEAM_ID"  # Ex: ABCDE12345
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (YOUR_TEAM_ID)"

# Optional for notarization
APPLE_ID="your@email.com"
APPLE_ID_PASSWORD="your-app-specific-password"
```

**Note**: For `APPLE_ID_PASSWORD`, use an app-specific password, not your main Apple ID password.

### 4. Configure the Build Configuration File

Edit `build/config.js` with your information:

```javascript
export const buildConfig = {
  appleTeamId: "YOUR_TEAM_ID",
  appleSigningIdentity: "Developer ID Application: Your Name (YOUR_TEAM_ID)",
  appleId: "your@email.com",
  appleIdPassword: "your-app-specific-password"
};
```

## Build and Sign

### Method 1: Use the Bash Script

```bash
# Grant script permissions
chmod +x scripts/build-signed.sh

# Run with environment variables
APPLE_TEAM_ID="YOUR_TEAM_ID" \
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (YOUR_TEAM_ID)" \
./scripts/build-signed.sh
```

### Method 2: Use electron-builder Directly

```bash
# Build the application
npm run build

# Create the signed package
electron-builder --mac dmg --publish never \
  --config.mac.identity="Developer ID Application: Your Name (YOUR_TEAM_ID)" \
  --config.mac.hardenedRuntime=true \
  --config.mac.gatekeeperAssess=false \
  --config.mac.entitlements="build/entitlements.mac.plist" \
  --config.mac.entitlementsInherit="build/entitlements.mac.plist"
```

## Notarization

Notarization is configured automatically if you provide `APPLE_ID` and `APPLE_ID_PASSWORD`.

To test notarization manually:

```bash
electron-builder --mac dmg --publish never \
  --config.mac.identity="Developer ID Application: Your Name (YOUR_TEAM_ID)" \
  --config.mac.hardenedRuntime=true \
  --config.mac.notarize=true \
  --config.mac.notarize.appBundleId="com.thibaut.chaton" \
  --config.mac.notarize.appleId="your@email.com" \
  --config.mac.notarize.appleIdPassword="your-app-specific-password"
```

## Troubleshooting

### Error: "notarize options were unable to be generated"

This error occurs when notarization information is not configured correctly. Check:

1. `APPLE_ID` and `APPLE_ID_PASSWORD` are set
2. The password is an app-specific password
3. Your developer account has required permissions

### Error: "No identity found"

Check that:
1. Your certificate is installed in Keychain
2. The certificate name in `APPLE_SIGNING_IDENTITY` is exact
3. You are using the correct Team ID

### Verify Installed Certificates

```bash
security find-identity -v -p codesigning
```

### Test Signing Manually

```bash
# Sign the app
codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name (YOUR_TEAM_ID)" release/mac/Chatons.app

# Verify signature
codesign --verify --deep --strict release/mac/Chatons.app
spctl -a -t exec -vv release/mac/Chatons.app
```

## Resources

- [Apple Developer Documentation](https://developer.apple.com/documentation/security/notarizing_mac_software_before_distribution)
- [Electron Builder Documentation](https://www.electron.build/code-signing)
- [Creating App-Specific Passwords](https://support.apple.com/en-us/HT204397)
