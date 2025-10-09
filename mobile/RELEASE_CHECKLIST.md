# Mind Clear - Google Play Release Checklist

## Pre-Release Setup

### 1. Keystore Generation (One-time only)
- [ ] Generate production keystore using keytool
- [ ] Store keystore file securely (backup in multiple locations)
- [ ] Document keystore credentials securely
- [ ] Verify keystore is excluded from git (.gitignore contains `*.keystore`)

### 2. Google Play Console Setup (One-time only)
- [ ] Create Google Play Console account ($25 one-time fee)
- [ ] Create new app in console
- [ ] Complete Store Listing:
  - [ ] App name: "Mind Clear"
  - [ ] Short description (80 chars max)
  - [ ] Full description
  - [ ] App icon (512x512 PNG)
  - [ ] Feature graphic (1024x500 PNG)
  - [ ] Screenshots (at least 2, up to 8)
- [ ] Complete Content Rating questionnaire
- [ ] Set up Privacy Policy URL (required)
- [ ] Configure App Content declarations
- [ ] Set up Internal Testing track

## Release Process

### 3. Version Management
- [ ] Update version in `mobile/android/app/build.gradle`:
  - [ ] `versionCode` (integer, must be unique and incrementing)
  - [ ] `versionName` (string, user-facing version like "1.0.0")
- [ ] Commit version changes to git

### 4. Build Process
- [ ] Ensure you have keystore password and key password
- [ ] Run release build script:
  ```powershell
  cd mobile
  .\build-release.ps1 -KeystorePassword "your_keystore_password" -KeyPassword "your_key_password"
  ```
- [ ] Verify AAB file created: `android/app/build/outputs/bundle/release/app-release.aab`
- [ ] Check AAB file size (should be reasonable, typically 10-50MB)

### 5. Google Play Console Upload
- [ ] Go to Google Play Console
- [ ] Navigate to "Testing" → "Internal testing"
- [ ] Click "Create new release"
- [ ] Upload AAB file: `app-release.aab`
- [ ] Add release notes
- [ ] Review release
- [ ] Roll out to internal testing

### 6. Testing Setup
- [ ] Add testers by email or create testing list
- [ ] Share internal testing URL with testers
- [ ] Verify testers can download and install the app
- [ ] Test core functionality on different devices

## Post-Release

### 7. Monitoring
- [ ] Monitor crash reports in Google Play Console
- [ ] Check user feedback and ratings
- [ ] Monitor app performance metrics

### 8. Documentation
- [ ] Update release notes in project documentation
- [ ] Document any issues found during testing
- [ ] Plan next version improvements

## Important Notes

### Security
- **NEVER** commit keystore files or passwords to version control
- Store keystore backups in multiple secure locations
- Losing the keystore means you cannot update your app on Google Play
- Use a password manager to store keystore credentials

### Version Management
- Each upload requires a unique `versionCode` (integer)
- `versionName` is user-facing and can be any string
- Google Play enforces version code incrementing
- Plan version strategy for future releases

### Build Configuration
- Current app ID: `com.foci.mobile`
- ProGuard is enabled for code minification
- Hermes JS engine is enabled for better performance
- Multi-APK generation is enabled for size optimization

### Troubleshooting
- If build fails, check environment variables are set correctly
- If upload fails, verify AAB file is not corrupted
- If testers can't install, check app signing and permissions
- For signing issues, verify keystore file and passwords are correct

## Quick Commands

### Generate Keystore (One-time)
```bash
cd mobile/android/app
keytool -genkeypair -v -storetype PKCS12 -keystore mindclear-release-key.keystore -alias mindclear-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

### Build Release AAB
```powershell
cd mobile
.\build-release.ps1 -KeystorePassword "your_password" -KeyPassword "your_password"
```

### Check AAB File
```powershell
Get-Item "mobile/android/app/build/outputs/bundle/release/app-release.aab" | Select-Object Name, Length, LastWriteTime
```

