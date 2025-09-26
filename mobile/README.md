This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Environment Variables for Release Builds

For Android release builds, you need to set the following environment variables:

- `KEYSTORE_PATH`: Path to your keystore file (e.g., `/path/to/your-release-key.keystore`)
- `KEYSTORE_PASSWORD`: Password for your keystore
- `KEY_ALIAS`: Alias name for your key in the keystore
- `KEY_PASSWORD`: Password for your key alias

**Example (PowerShell):**
```powershell
$env:KEYSTORE_PATH = "C:\path\to\your-release-key.keystore"
$env:KEYSTORE_PASSWORD = "your_keystore_password"
$env:KEY_ALIAS = "your_key_alias"
$env:KEY_PASSWORD = "your_key_password"
```

**Example (Bash):**
```bash
export KEYSTORE_PATH="/path/to/your-release-key.keystore"
export KEYSTORE_PASSWORD="your_keystore_password"
export KEY_ALIAS="your_key_alias"
export KEY_PASSWORD="your_key_password"
```

**Security Note:** Never commit your keystore file or passwords to version control. Store them securely in your CI/CD environment or local development environment.

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.

## Momentum Mode (mobile-only)

Momentum Mode accelerates task flow by automatically suggesting the next focus task and providing quick controls for travel preference and skipping.

### Backend endpoints
- POST `POST /api/tasks/focus/next`
  - Selects/unsets/sets focus; prioritizes high > medium > low, then earliest due date; supports `travel_preference` (`'home_only'` filters out tasks with a location) and `exclude_ids`; ensures a default duration of 30 minutes if missing.
- App Preferences `GET/PUT /api/user/app-preferences`
  - Persists Momentum settings under keys: `momentum_mode_enabled` and `momentum_travel_preference` (`'allow_travel' | 'home_only'`).

Related SQL migration: see `SQL/migrations/2025-08-24_0013_user_app_preferences.sql` in the repository root.

### Using Momentum in the app
- Open the `Tasks` tab.
- Toggle Momentum using the zap icon button (shows “Momentum On/Off”).
- Adjust travel preference with the adjacent button (“Allow Travel” / “Home Only”).
- When a focus task is completed and Momentum is enabled, the app auto-advances and shows a toast: `Next up: [New Task Title]`.
- Use the Skip button on the focus card to request the next candidate (excludes current task). If no candidates remain, you’ll see: `No other tasks match your criteria.` When finishing the last candidate via complete, you’ll see: `Great work, you've cleared all your tasks!`.
- No calendar events are created by this flow.

### Tests
- UI tests cover: Momentum toggle, travel preference switching, skip behavior, auto-advance, and empty-candidate cases.
- Run: `npm test`
