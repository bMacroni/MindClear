<!-- 03cfc7dc-2b06-4f3f-acee-2923bf8c939e cea13096-9261-4600-a257-dc0ee602e2df -->
# Goal

Ensure users don’t see the initial “downloading” bar at the top of screens.

### What it is

- **It’s the React Native Dev Loading View** shown in debug builds while the JS bundle loads. It never appears in release builds.
- Confirmation in Android app config (dev support enabled in debug):
```16:30:mobile/android/app/src/main/java/com/foci/mobile/MainApplication.kt
override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
```


### Approach

- **For users/QA testers**: Install a release build; the bar won’t appear.
- **For developers**: Keep using debug builds normally; this bar is expected only during development.
- **Optional UI polish**: If a separate top banner still appears (e.g., offline/sync), we can render it below headers or delay its initial appearance.

### Android (focus)

- Build release APK/AAB:
  - APK: `cd mobile/android && .\gradlew.bat assembleRelease`
  - AAB: `cd mobile/android && .\gradlew.bat bundleRelease`
- Install APK on device: `adb install -r app\build\outputs\apk\release\app-release.apk`

### Notes

- If you ever need a “debuggable but no dev loading view” variant for internal testers, we can add an `internalRelease` build type that disables dev support but keeps logs. Let me know if you want that.

### To-dos

- [ ] Confirm dev loading view source in `MainApplication.kt` (debug only)
- [ ] Produce Android release build (APK/AAB) for testers
- [ ] Adjust or delay in-app `OfflineIndicator` if it flashes on launch