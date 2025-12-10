# New Architecture (Fabric/TurboModules) Guide

This document provides information about React Native's new architecture, compatibility requirements, rollback procedures, and testing guidelines for Mind Clear.

## Overview

The new architecture includes:
- **Fabric**: The new rendering system that improves performance and enables better interoperability
- **TurboModules**: A new native module system that provides better type safety and performance

## Current Status

- **Enabled**: `newArchEnabled=true` in `mobile/android/gradle.properties` (line 51)
- **Reanimated**: `reanimated.newArchEnabled=true` (line 52)
- **React Native Version**: 0.80.1
- **Reanimated Version**: 3.18.0 (pinned for compatibility)

## Compatibility Checklist

Before enabling or changing the new architecture flag, verify the following:

### Required Dependencies

- [x] **react-native**: 0.80.1 (supports new architecture)
- [x] **react-native-reanimated**: 3.18.0 (compatible with RN 0.80 and new architecture)
- [x] **react-native-gesture-handler**: ^2.27.2 (compatible with new architecture)
- [x] **@react-native-firebase/app**: ^20.0.0 (should support new architecture)
- [x] **@react-native-firebase/messaging**: ^20.0.0 (should support new architecture)

### Native Setup Requirements

#### Android

1. **gradle.properties**:
   ```properties
   newArchEnabled=true
   reanimated.newArchEnabled=true
   ```

2. **Build Configuration**:
   - Ensure `android/app/build.gradle` uses the React Native Gradle Plugin
   - Verify `react { autolinkLibrariesWithApp() }` is configured

3. **Native Dependencies**:
   - Firebase BoM: `34.4.0` (forced in `build.gradle`)
   - Google Play Services: `20.7.0`

#### iOS

1. **Podfile**:
   - Ensure `use_react_native!` is called with proper configuration
   - Verify `react_native_post_install` is configured

2. **Build Settings**:
   - New architecture should be automatically enabled when `newArchEnabled=true` is set in Android
   - Verify Xcode project settings for Fabric/TurboModules

### Testing Requirements

Before merging changes that affect `newArchEnabled`:

- [x] Run `npm test -- src/__tests__/new-architecture.test.tsx`
- [x] Build Android debug APK: `cd android && ./gradlew assembleDebug`
- [x] Build Android release APK: `cd android && ./gradlew assembleRelease`
- [ ] Build iOS Debug: `cd ios && xcodebuild -workspace mobile.xcworkspace -scheme mobile -configuration Debug`
- [ ] Build iOS Release: `cd ios && xcodebuild -workspace mobile.xcworkspace -scheme mobile -configuration Release`
- [x] Test on physical Android device
- [ ] Test on physical iOS device (if applicable)
- [x] Verify no new architecture warnings in build logs
- [x] Test critical user flows (task completion, animations, gestures)

### Verified Compatible Libraries (2025-12-10)

The following libraries have been manually tested and confirmed working with New Architecture:

| Library | Version | Status |
|---------|---------|--------|
| react-native-reanimated | 3.18.0 | ✅ Verified |
| react-native-gesture-handler | ^2.27.2 | ✅ Verified |
| @nozbe/watermelondb | ^0.28.0 | ✅ Verified (JSI disabled) |
| react-native-haptic-feedback | ^2.3.3 | ✅ Verified |
| react-native-encrypted-storage | ^4.0.3 | ✅ Verified |
| @react-native-google-signin/google-signin | ^11.0.1 | ✅ Verified |
| @react-native-firebase/messaging | ^20.0.0 | ✅ Verified |
| moti | ^0.30.0 | ✅ Verified |
| @react-native-community/datetimepicker | ^8.4.3 | ✅ Verified |

## Rollback Procedure

If issues are discovered after enabling the new architecture, follow these steps to rollback:

### Step 1: Disable New Architecture

Edit `mobile/android/gradle.properties`:

```properties
# Change from:
newArchEnabled=true
reanimated.newArchEnabled=true

# To:
newArchEnabled=false
# Remove or comment out reanimated.newArchEnabled
```

### Step 2: Clean Build

**Android:**
```powershell
cd mobile/android
./gradlew clean
./gradlew assembleDebug
```

**iOS:**
```bash
cd mobile/ios
rm -rf build
rm -rf Pods
pod install
xcodebuild clean -workspace mobile.xcworkspace -scheme mobile
```

### Step 3: Verify Rollback

1. Build the app in both debug and release modes
2. Run unit tests: `npm test`
3. Test on physical devices
4. Verify no errors in console/logs

### Step 4: Commit Rollback

```bash
git add mobile/android/gradle.properties
git commit -m "rollback: disable new architecture due to [issue description]"
```

### Step 5: Document Issues

Create an issue documenting:
- What problems were encountered
- Which features/components were affected
- Steps to reproduce
- Potential fixes for future attempts

## Common Issues and Solutions

### Issue: Build Failures

**Symptoms**: Gradle build fails with errors about Fabric or TurboModules

**Solutions**:
1. Clean build: `./gradlew clean`
2. Verify all native dependencies are compatible
3. Check that `react-native-reanimated` is at version 3.18.0
4. Ensure Firebase BoM version matches (34.4.0)

### Issue: Runtime Crashes

**Symptoms**: App crashes on startup or when using certain features

**Solutions**:
1. Check native module compatibility
2. Verify Reanimated worklets are properly configured
3. Review crash logs for specific module errors
4. Consider rolling back if critical features are affected

### Issue: Performance Degradation

**Symptoms**: Slower animations or UI interactions

**Solutions**:
1. Profile the app to identify bottlenecks
2. Verify Reanimated is using worklets correctly
3. Check for unnecessary re-renders
4. Consider optimizing component structure

### Issue: Missing Features

**Symptoms**: Certain features don't work as expected

**Solutions**:
1. Verify the library supports new architecture
2. Check for library updates that add new architecture support
3. Review library documentation for migration guides
4. Consider using alternative libraries if needed

## Monitoring

After enabling new architecture, monitor:

1. **Crash Reports**: Watch for new architecture-related crashes
2. **Performance Metrics**: Monitor app startup time and animation performance
3. **User Feedback**: Collect feedback on app responsiveness
4. **Build Times**: Track if build times increase significantly

## Resources

- [React Native New Architecture Docs](https://reactnative.dev/docs/the-new-architecture/landing-page)
- [Reanimated New Architecture Guide](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/#new-architecture)
- [React Native 0.80 Release Notes](https://github.com/facebook/react-native/releases/tag/v0.80.0)

## Support

If you encounter issues:

1. Check this document for common solutions
2. Test with `newArchEnabled=false` to isolate issues
3. Create an issue with detailed error logs and reproduction steps

## Version History

- **2025-12-08**: Initial documentation created
- **2025-12-10**: Manual testing completed - all critical user flows verified working with New Architecture
- **Current**: `newArchEnabled=true` with React Native 0.80.1 and Reanimated 3.18.0 (production ready)


