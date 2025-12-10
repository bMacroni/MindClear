# CI/CD Workflows for Mind Clear Mobile

This directory contains GitHub Actions workflows for continuous integration and deployment of the Mind Clear mobile application.

## Workflows

### `mobile-ci.yml`

Main CI workflow that runs on every push and pull request to mobile code. It includes:

- **Lint and Unit Tests**: Runs ESLint and Jest unit tests
- **Android Build Matrix**: Tests both debug and release builds
- **iOS Build Matrix**: Tests both Debug and Release builds
- **E2E Tests**: End-to-end tests for new architecture features
- **Native Dependencies Check**: Verifies compatibility of native libraries

**Triggers:**
- Push to `main`, `develop`, or `feature_*` branches
- Pull requests to `main` or `develop`
- Manual trigger via `workflow_dispatch`

### `new-architecture-gate.yml`

Gating workflow that specifically monitors changes to the new architecture flag (`newArchEnabled`). It:

- Detects when `newArchEnabled` changes in `gradle.properties`
- Runs compatibility checks
- Verifies documentation exists
- Runs new architecture tests
- Posts a checklist comment on PRs

**Triggers:**
- Pull requests that modify `mobile/android/gradle.properties`
- Pull requests that modify `mobile/ios/Podfile`
- Pull requests that modify `mobile/package.json`
- Pushes to `main` or `develop` that modify the above files

## Usage

### Running Tests Locally

Before pushing, run:

```powershell
cd mobile
npm test
npm run lint
```

### Forcing New Architecture Tests

To manually trigger new architecture tests in CI, include `[force-new-arch-test]` in your commit message:

```bash
git commit -m "feat: update feature [force-new-arch-test]"
```

### Checking Workflow Status

1. Go to the "Actions" tab in GitHub
2. Select the workflow run
3. Review job results and logs

## Requirements

- Node.js 18+
- Java 17 (for Android builds)
- Xcode (for iOS builds, macOS runners only)

## Environment Variables

The following secrets need to be configured in GitHub repository settings:

- `ANDROID_KEYSTORE_PATH`: Path to Android keystore file
- `ANDROID_KEYSTORE_PASSWORD`: Password for Android keystore
- `ANDROID_KEY_PASSWORD`: Password for Android key
- `ANDROID_KEY_ALIAS`: Alias for Android key

## Troubleshooting

### Workflow Fails on Android Build

1. Check that `newArchEnabled=true` is set correctly
2. Verify all native dependencies are compatible
3. Review build logs for specific errors
4. Try cleaning the build: `cd mobile/android && ./gradlew clean`

### Workflow Fails on iOS Build

1. Verify CocoaPods are installed correctly
2. Check that `pod install` runs successfully
3. Review Xcode build logs
4. Ensure Xcode version is compatible

### New Architecture Tests Fail

1. Run tests locally: `npm test -- src/__tests__/new-architecture.test.tsx`
2. Check that Reanimated 3.18.0 is installed
3. Verify gesture-handler is compatible
4. Review test output for specific failures

## Documentation

For detailed information about the new architecture, rollback procedures, and compatibility requirements, see:

- [NEW_ARCHITECTURE.md](../mobile/docs/NEW_ARCHITECTURE.md)


