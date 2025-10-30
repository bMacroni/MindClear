# Services

This directory contains service modules for the mobile app.

## Secure Configuration Service

The `secureConfig.ts` file manages application configuration securely, preventing exposure of sensitive information in client-side code.

### Supabase Configuration

The app uses Supabase for real-time database synchronization. Configuration is loaded from two sources in priority order:

1. **Remote Config** (Primary): Fetched from backend API `/api/user/config` endpoint
2. **Environment Variables** (Fallback): Set at build time via `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### Required Environment Variables

**For Development:**
- `SUPABASE_URL` - Your Supabase project URL (optional, uses remote config if available)
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key (optional, uses remote config if available)

**For Production:**
- Either remote config from backend OR `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment variables are required
- Production builds will fail with a descriptive error if neither source is available

### Security Notes

⚠️ **CRITICAL**: Never hardcode Supabase keys or URLs in source code.

- Keys are only sourced from runtime configuration (remote config or environment variables)
- Local `.env` files are excluded from git (see `.gitignore`)
- Environment variables should be set in your CI/CD pipeline or build system
- Rotate exposed keys immediately if they appear in git history
- Use platform secret managers (e.g., Android Keystore, iOS Keychain) for production builds when possible

### Setting Environment Variables

**PowerShell (Windows):**
```powershell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY = "your-anon-key-here"
```

**Bash (Linux/macOS):**
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key-here"
```

**React Native Build Configuration:**
- For Android: Set in `android/gradle.properties` or via build configuration
- For iOS: Set in Xcode build settings or via `.xcode.env` file

### Troubleshooting

If you see errors about missing Supabase configuration:

1. **Development Mode**: Check that remote config is loading from backend, or set environment variables
2. **Production Builds**: Ensure environment variables are set in your build pipeline
3. **Remote Config**: Verify backend `/api/user/config` endpoint returns valid `supabaseUrl` and `supabaseAnonKey`

## Supabase Integration

The `supabase.ts` file contains the Supabase client configuration for real-time database synchronization.

### Setup Required

1. **Update Supabase Configuration**: 
   - Replace `SUPABASE_URL` with your actual Supabase project URL
   - Replace `SUPABASE_ANON_KEY` with your actual anon key

2. **Database Tables**: 
   - Ensure you have `calendar_events` and `tasks` tables in your Supabase database
   - Enable Row Level Security (RLS) policies for these tables

3. **Real-time Features**:
   - Enable real-time subscriptions in your Supabase project settings
   - Configure the necessary database triggers for real-time updates

### Real-time Sync Features

- **Calendar Events**: Automatically syncs when events are created, updated, or deleted
- **Tasks**: Automatically syncs when tasks are created, updated, or deleted
- **Cross-device Updates**: Changes made on one device appear instantly on other devices
- **Offline Support**: Changes are queued and synced when connection is restored

### Usage

The Supabase client is imported in `CalendarScreen.tsx` and automatically:
- Establishes real-time subscriptions on component mount
- Handles INSERT, UPDATE, and DELETE events
- Updates the local state to reflect database changes
- Cleans up subscriptions on component unmount

### Authentication

The `getCurrentUserId()` function needs to be implemented based on your authentication system to filter data by user. 