# Mind Clear - AI-Powered Mental Health Productivity Platform

Mind Clear is an intelligent productivity platform designed to support users with anxiety and depression by providing AI-assisted goal setting, task management, and calendar integration with advanced automatic scheduling capabilities.

## 🚀 Features

### Core Functionality
- **AI-Powered Goal Management**: Create and manage goals with AI suggestions and breakdown into milestones and steps
- **Smart Task Management**: Organize tasks with priority, status, and intelligent scheduling
- **Advanced Auto-Scheduling**: AI-powered automatic task scheduling with weather and travel time integration
- **Calendar Integration**: Sync with Google Calendar and manage events seamlessly
- **Natural Language Interface**: Chat with AI to create goals, tasks, and calendar events
- **Conversation Management**: Thread-based conversations with AI for better context retention
- **Notification System**: Comprehensive notification center with email and in-app notifications
- **Help System**: Interactive help overlays and guidance throughout the mobile app

### Auto-Scheduling Features
- **Weather-Aware Scheduling**: Outdoor tasks automatically scheduled based on weather conditions
- **Travel Time Integration**: Location-based tasks consider travel time from GraphHopper API
- **Recurring Task Support**: Automatic rescheduling of recurring tasks (daily, weekly, monthly)
- **User Preferences**: Customizable scheduling preferences (work hours, buffer time, max tasks per day)
- **Background Processing**: Automated daily and periodic scheduling runs
- **Conflict Resolution**: Intelligent handling of calendar conflicts and weather issues

### User Experience
- **Modern Minimal UI**: Clean black and white design for reduced cognitive load
- **Responsive Design**: Works seamlessly across desktop and mobile devices
- **Success Feedback**: Toast notifications for all user actions
- **Error Handling**: Graceful error handling with user-friendly messages
- **Loading States**: Smooth loading indicators throughout the app
- **Drag & Drop**: Intuitive drag-and-drop for calendar events and task management
- **Haptic Feedback**: Touch feedback for mobile interactions
- **Offline Support**: Mobile app works offline with sync when connection restored

## 📁 Project Structure

```
mindgarden/
├── 📁 backend/                          # Backend API server
│   ├── 📁 src/
│   │   ├── 📁 controllers/              # Business logic controllers
│   │   │   ├── autoSchedulingController.js    # Auto-scheduling logic (30KB)
│   │   │   ├── goalsController.js             # Goal management (24KB)
│   │   │   ├── tasksController.js             # Task management (21KB)
│   │   │   ├── conversationController.js      # AI conversation handling (14KB)
│   │   │   ├── milestonesController.js        # Milestone operations (4.2KB)
│   │   │   ├── userController.js              # User management (1.3KB)
│   │   │   └── feedbackController.js          # Feedback handling (996B)
│   │   ├── 📁 routes/                   # API route definitions
│   │   │   ├── ai.js                    # AI chat endpoints (12KB)
│   │   │   ├── calendar.js              # Calendar integration (8.3KB)
│   │   │   ├── tasks.js                 # Task CRUD operations (2.7KB)
│   │   │   ├── goals.js                 # Goal CRUD operations (1.8KB)
│   │   │   ├── auth.js                  # Authentication (4.2KB)
│   │   │   ├── googleAuth.js            # Google OAuth (1.9KB)
│   │   │   ├── googleMobileAuth.js      # Google Sign-In for mobile (8.2KB)
│   │   │   ├── conversations.js         # Conversation threads (1.1KB)
│   │   │   └── user.js                  # User settings (402B)
│   │   ├── 📁 utils/                    # Utility services
│   │   │   ├── geminiService.js         # AI service integration (30KB)
│   │   │   ├── calendarService.js       # Calendar operations (21KB)
│   │   │   ├── geminiFunctionDeclarations.js # AI function definitions (20KB)
│   │   │   ├── weatherService.js        # Weather API integration (9.9KB)
│   │   │   ├── travelTimeService.js     # Travel time calculations (7.9KB)
│   │   │   ├── apiService.js            # External API utilities (6.8KB)
│   │   │   ├── dateParser.js            # Date parsing utilities (9.1KB)
│   │   │   ├── googleTokenStorage.js    # Google token management (2.1KB)
│   │   │   ├── syncService.js           # Calendar sync service (3.6KB)
│   │   │   ├── firebaseAdmin.js         # Firebase Admin SDK setup (2.1KB)
│   │   │   ├── cacheService.js          # Caching service (2.1KB)
│   │   │   ├── cidrValidator.js         # CIDR validation utility (1.8KB)
│   │   │   ├── configValidator.js       # Configuration validation (1.5KB)
│   │   │   ├── logger.js                # Logging service (1.2KB)
│   │   │   ├── securityMonitor.js       # Security monitoring (1.1KB)
│   │   │   ├── tokenEncryption.js       # Token encryption utility (0.9KB)
│   │   │   ├── webSocketManager.js      # WebSocket management (0.8KB)
│   │   │   ├── googleAuth.js            # Google auth utilities (351B)
│   │   │   └── jwtUtils.js              # JWT utilities (456B)
│   │   ├── 📁 services/                 # Business services
│   │   │   └── notificationService.js   # Email & in-app notifications (15KB)
│   │   ├── 📁 middleware/               # Express middleware
│   │   │   ├── auth.js                  # Authentication middleware (539B)
│   │   │   ├── enhancedAuth.js          # Enhanced authentication (1.2KB)
│   │   │   ├── requestTracking.js       # Request tracking middleware (0.8KB)
│   │   │   └── security.js              # Security middleware (0.6KB)
│   │   └── server.js                    # Main server file (7.9KB)
│   ├── 📁 tests/                        # Backend test files
│   │   ├── AI_FUNCTION_TEST_LIST.md     # AI function test documentation
│   │   ├── calendarEvents.test.js       # Calendar events tests
│   │   ├── calendarUpdateTimeOnly.test.js # Calendar update tests
│   │   ├── compressionFilter.test.js    # Compression filter tests
│   │   ├── dateParser.test.js           # Date parser tests
│   │   ├── dateParsing.test.js          # Date parsing tests
│   │   ├── geminiService.test.js        # AI service tests
│   │   ├── goalTitles.endpoint.test.js  # Goal titles endpoint tests
│   │   ├── googleAuth.mobile.test.js    # Google auth mobile tests
│   │   ├── responseLanguage.test.js     # Response language tests
│   │   ├── serverHealth.test.js         # Server health tests
│   │   ├── travelTimeService.test.js    # Travel time service tests
│   │   ├── weatherService.test.js       # Weather service tests
│   │   └── setup.js                     # Test setup configuration
│   ├── package.json                     # Backend dependencies
│   ├── env.example                      # Environment variables template
│   ├── env.development.example          # Development environment template
│   ├── env.production.example           # Production environment template
│   ├── vitest.config.js                 # Test configuration
│   ├── GOAL_HIERARCHY_API.md           # Goal API documentation
│   ├── GOAL_TITLES_API.md              # Goal titles API documentation
│   ├── TRUST_PROXY_SECURITY.md         # Trust proxy security documentation
│   └── deploy-logging-fix.md           # Deployment logging fix documentation
│
├── 📁 frontend/                         # React frontend application
│   ├── 📁 src/
│   │   ├── 📁 components/               # React components
│   │   │   ├── AIChat.jsx               # AI chat interface (65KB)
│   │   │   ├── CalendarEvents.jsx       # Calendar management (53KB)
│   │   │   ├── GoalList.jsx             # Goal display & management (30KB)
│   │   │   ├── TaskList.jsx             # Task display & management (25KB)
│   │   │   ├── AutoScheduledTasksTable.jsx # Auto-scheduling table (18KB)
│   │   │   ├── AutoSchedulingDashboard.jsx # Auto-scheduling dashboard (16KB)
│   │   │   ├── TasksPage.jsx            # Tasks page component (16KB)
│   │   │   ├── TaskForm.jsx             # Task creation/editing (16KB)
│   │   │   ├── GoalForm.jsx             # Goal creation/editing (19KB)
│   │   │   ├── InlineTaskEditor.jsx     # Inline task editing (13KB)
│   │   │   ├── GoalBreakdownForm.jsx    # Goal breakdown assistant (11KB)
│   │   │   ├── Login.jsx                # Authentication UI (10KB)
│   │   │   ├── NotificationCenter.jsx   # Notification system (7.2KB)
│   │   │   ├── CalendarStatus.jsx       # Calendar sync status (6.9KB)
│   │   │   ├── MilestoneRow.jsx         # Milestone component (6.6KB)
│   │   │   ├── FeedbackModal.jsx        # Feedback modal (3.5KB)
│   │   │   ├── Signup.jsx               # Registration UI (3.8KB)
│   │   │   ├── SuccessToast.jsx         # Success notifications (2.6KB)
│   │   │   ├── GoalBreakdownAssistant.jsx # Goal breakdown helper (2.3KB)
│   │   │   ├── BulkApprovalPanel.jsx    # Bulk action panel (1.7KB)
│   │   │   ├── StepRow.jsx              # Step component (1.7KB)
│   │   │   └── SubTaskRow.jsx           # Sub-task component (1.1KB)
│   │   ├── 📁 services/                 # API service layer
│   │   │   └── api.js                   # API client & endpoints (8.1KB)
│   │   ├── 📁 contexts/                 # React contexts
│   │   │   ├── AuthContext.jsx          # Authentication context (4.7KB)
│   │   │   └── AIActionContext.jsx      # AI action context (1.1KB)
│   │   ├── 📁 utils/                    # Frontend utilities
│   │   │   ├── timezones.js             # Timezone utilities (4.7KB)
│   │   │   ├── dateUtils.ts             # Date manipulation utilities (2.2KB)
│   │   │   ├── validation.ts            # Form validation utilities (1.1KB)
│   │   │   └── errorHandling.ts         # Error handling utilities (0.8KB)
│   │   ├── 📁 pages/                    # Page components
│   │   │   └── Dashboard.jsx            # Main dashboard (11KB)
│   │   ├── 📁 assets/                   # Static assets
│   │   ├── 📁 tests/                    # Frontend test files
│   │   │   └── App.test.js              # App component tests
│   │   ├── App.jsx                      # Main app component (1.7KB)
│   │   ├── App.css                      # App styles (3.6KB)
│   │   ├── index.css                    # Global styles (2.2KB)
│   │   └── main.jsx                     # App entry point (244B)
│   ├── 📁 dist/                         # Built frontend assets
│   ├── package.json                     # Frontend dependencies
│   ├── vite.config.js                   # Vite configuration
│   ├── tailwind.config.js               # Tailwind CSS configuration
│   ├── postcss.config.js                # PostCSS configuration
│   ├── vitest.config.js                 # Test configuration
│   ├── vercel.json                      # Vercel deployment config
│   ├── test-csp.js                      # CSP testing script
│   ├── verify-csp-production.js         # CSP verification script
│   └── index.html                       # HTML template
│
├── 📁 SQL/                              # Database schema & migrations
│   ├── 📁 migrations/                   # Database migrations
│   │   ├── 2025-08-15_add_event_type_goal_id_all_day_to_calendar_events.sql
│   │   ├── 2025-08-16_0001_guided_brain_dump_today_focus.sql
│   │   ├── 2025-08-16_0002_user_profile_fields_and_enums.sql
│   │   ├── 2025-08-16_0003_steps_add_completed.sql
│   │   ├── 2025-08-16_0004_auto_task_scheduling_core.sql
│   │   ├── 2025-08-16_0005_notifications_table.sql
│   │   ├── 2025-08-16_0006_milestones_steps_rls_policies.sql
│   │   ├── 2025-08-16_0007_fix_auto_scheduling_dashboard_view.sql
│   │   ├── 2025-08-16_0008_calendar_events_add_event_type_goal_id_all_day.sql
│   │   ├── 2025-08-16_0009_add_conversations_and_google_tokens.sql
│   │   ├── 2025-08-22_0010_add_missing_task_columns.sql
│   │   ├── 2025-08-22_0011_sync_task_status_completed.sql
│   │   ├── 2025-08-22_0012_drop_completed_from_tasks.sql
│   │   ├── 2025-08-24_0013_user_app_preferences.sql
│   │   ├── 2025-08-26_0014_add_subscription_tier_to_users.sql
│   │   ├── 2025-08-27_0015_calendar_first_import_and_index.sql
│   │   ├── 2025-09-05_0016_notification_preferences_and_devices.sql
│   │   ├── 2025-09-05_0017_add_reminder_sent_to_tasks.sql
│   │   ├── 2025-09-05_0018_add_completed_to_milestones.sql
│   │   ├── 2025-09-05_0019_archived_notifications.sql
│   │   ├── 2025-09-15_0020_add_description_to_milestones.sql
│   │   ├── 2025-09-16_0021_performance_optimization_indexes.sql
│   │   └── README.md                    # Migration documentation
│   ├── 📁 rollbacks/                    # Migration rollback scripts
│   │   ├── 2025-08-16_0004_auto_task_scheduling_core.rollback.sql
│   │   └── README.md                    # Rollback documentation
│   ├── 📁 schema/                       # Database schema snapshots
│   │   └── 000_full_schema_snapshot.sql # Full database schema
│   └── README.md                        # Database documentation
│
├── 📁 mobile/                           # React Native mobile app
│   ├── 📁 src/                          # Mobile app source
│   │   ├── 📁 components/               # Reusable React Native components
│   │   │   ├── 📁 common/               # Common UI components
│   │   │   │   ├── Button.tsx           # Custom button component (2.7KB)
│   │   │   │   ├── CustomTabBar.tsx     # Custom tab bar component (3.4KB)
│   │   │   │   ├── Input.tsx            # Custom input component (1004B)
│   │   │   │   ├── PasswordInput.tsx    # Password input component (1.2KB)
│   │   │   │   ├── GoogleSignInButton.tsx # Google Sign-In button (2.1KB)
│   │   │   │   ├── SuccessToast.tsx     # Success notification component (5.2KB)
│   │   │   │   ├── Loading.tsx          # Loading spinner component (0B)
│   │   │   │   ├── Card.tsx             # Card container component (0B)
│   │   │   │   └── index.ts             # Common components export (117B)
│   │   │   ├── 📁 ai/                   # AI-related components
│   │   │   │   ├── MessageBubble.tsx    # AI message display component (0B)
│   │   │   │   └── QuickActions.tsx     # AI quick action buttons (0B)
│   │   │   ├── 📁 goals/                # Goal-related components
│   │   │   │   ├── GoalsListModal.tsx   # Goals list modal component (12KB)
│   │   │   │   ├── GoalCard.tsx         # Goal card display component (0B)
│   │   │   │   └── GoalForm.tsx         # Goal form component (0B)
│   │   │   ├── 📁 tasks/                # Task-related components
│   │   │   │   ├── TaskForm.tsx         # Task form component (27KB)
│   │   │   │   ├── TaskCard.tsx         # Task card display component (13KB)
│   │   │   │   ├── AutoSchedulingPreferencesModal.tsx # Auto-scheduling preferences (14KB)
│   │   │   │   └── 📁 __tests__/        # Task component tests
│   │   │   └── 📁 help/                 # Help system components
│   │   │       ├── HelpIcon.tsx         # Help icon component (0B)
│   │   │       ├── HelpOverlay.tsx      # Help overlay component (0B)
│   │   │       └── HelpTarget.tsx       # Help target component (0B)
│   │   ├── 📁 screens/                  # Screen components
│   │   │   ├── 📁 auth/                 # Authentication screens
│   │   │   │   ├── LoginScreen.tsx      # Login screen (4.5KB)
│   │   │   │   └── SignupScreen.tsx     # Signup screen (5.0KB)
│   │   │   ├── 📁 ai/                   # AI chat screens
│   │   │   │   └── AIChatScreen.tsx     # AI chat interface (24KB)
│   │   │   ├── 📁 calendar/             # Calendar screens
│   │   │   │   ├── CalendarScreen.tsx   # Calendar view screen (0B)
│   │   │   │   └── README.md            # Calendar screen documentation
│   │   │   ├── 📁 goals/                # Goal management screens
│   │   │   │   ├── GoalsScreen.tsx      # Goals list screen (32KB)
│   │   │   │   ├── GoalDetailScreen.tsx # Goal detail view (16KB)
│   │   │   │   └── GoalFormScreen.tsx   # Goal creation/editing (18KB)
│   │   │   ├── 📁 tasks/                # Task management screens
│   │   │   │   ├── TasksScreen.tsx      # Tasks list screen (18KB)
│   │   │   │   ├── TaskDetailScreen.tsx # Task detail view (9.8KB)
│   │   │   │   └── TaskFormScreen.tsx   # Task creation/editing (2.8KB)
│   │   │   └── 📁 profile/              # Profile management screens
│   │   │       └── ProfileScreen.tsx    # User profile screen (0B)
│   │   ├── 📁 navigation/               # Navigation configuration
│   │   │   ├── AppNavigator.tsx         # Main app navigation (2.1KB)
│   │   │   ├── TabNavigator.tsx         # Tab navigation setup (1.8KB)
│   │   │   └── types.ts                 # Navigation type definitions (423B)
│   │   ├── 📁 services/                 # API and business services
│   │   │   ├── api.ts                   # API client and endpoints (18KB)
│   │   │   ├── apiService.ts            # Enhanced API service (12KB)
│   │   │   ├── auth.ts                  # Authentication service (12KB)
│   │   │   ├── googleAuth.ts            # Google Sign-In service (8.1KB)
│   │   │   ├── config.ts                # Configuration service (2.3KB)
│   │   │   ├── enhancedApi.ts           # Enhanced API client (1.8KB)
│   │   │   ├── errorHandling.ts         # Error handling service (1.5KB)
│   │   │   ├── notificationService.ts   # Notification service (1.2KB)
│   │   │   ├── offline.ts               # Offline support service (1.1KB)
│   │   │   ├── onboarding.ts            # Onboarding service (0.9KB)
│   │   │   ├── secureConfig.ts          # Secure configuration (0.8KB)
│   │   │   ├── secureStorage.ts         # Secure storage service (0.7KB)
│   │   │   ├── storage.ts               # Local storage service (0B)
│   │   │   ├── storageMigration.ts      # Storage migration service (0B)
│   │   │   ├── 📁 __tests__/            # Service tests
│   │   │   │   └── tasksAPI.focusNext.test.ts # Tasks API tests
│   │   │   └── README.md                # Services documentation
│   │   ├── 📁 themes/                   # Design system and theming
│   │   │   ├── colors.ts                # Color palette definitions (628B)
│   │   │   ├── spacing.ts               # Spacing and layout constants (235B)
│   │   │   └── typography.ts            # Typography definitions (723B)
│   │   ├── 📁 types/                    # TypeScript type definitions
│   │   │   ├── autoScheduling.ts        # Auto-scheduling type definitions (2.3KB)
│   │   │   ├── api.ts                   # API type definitions (1.8KB)
│   │   │   ├── auth.ts                  # Authentication types (1.2KB)
│   │   │   └── navigation.ts            # Navigation types (0.9KB)
│   │   ├── 📁 utils/                    # Utility functions
│   │   │   ├── dateUtils.ts             # Date manipulation utilities (2.2KB)
│   │   │   ├── validation.ts            # Form validation utilities (0B)
│   │   │   ├── animations.ts            # Animation utilities (0B)
│   │   │   ├── errorRecovery.ts         # Error recovery utilities (0B)
│   │   │   ├── errorSanitizer.ts        # Error sanitization utilities (0B)
│   │   │   ├── hapticFeedback.ts        # Haptic feedback utilities (0B)
│   │   │   ├── lazyListUtils.tsx        # Lazy list utilities (0B)
│   │   │   ├── lazyLoading.tsx          # Lazy loading utilities (0B)
│   │   │   ├── logger.ts                # Logging utilities (0B)
│   │   │   ├── robustLazyLoading.tsx    # Robust lazy loading utilities (0B)
│   │   │   ├── screenPreloader.ts       # Screen preloader utilities (0B)
│   │   │   └── 📁 gsignin-assets/       # Google Sign-In assets
│   │   │       ├── 📁 dark/             # Dark theme assets
│   │   │       ├── 📁 light/            # Light theme assets
│   │   │       └── 📁 neutral/          # Neutral theme assets
│   │   ├── 📁 hooks/                    # Custom React hooks (empty)
│   │   ├── 📁 contexts/                 # React contexts
│   │   │   ├── AuthContext.tsx          # Authentication context (4.7KB)
│   │   │   └── AIActionContext.tsx      # AI action context (1.1KB)
│   │   ├── 📁 assets/                   # Static assets
│   │   │   └── mindclear-logo.svg       # Mind Clear logo
│   │   ├── 📁 test/                     # Test utilities
│   │   │   └── 📁 __mocks__/            # Test mocks
│   │   ├── App.tsx                      # Mobile app entry point
│   │   └── index.js                     # Mobile app entry point
│   ├── 📁 android/                      # Android configuration
│   │   └── 📁 app/
│   │       └── google-services.json     # Firebase Android config
│   ├── 📁 android-assets/               # Android-specific assets
│   ├── 📁 ios/                          # iOS configuration
│   ├── 📁 build/                        # Build artifacts
│   ├── 📁 docs/                         # Mobile documentation
│   │   └── ENHANCED_ERROR_HANDLING.md   # Error handling documentation
│   ├── 📁 scripts/                      # Build and utility scripts
│   │   ├── analyze-bundle.js            # Bundle analysis script
│   │   ├── generate-android-icons.mjs   # Android icon generation
│   │   └── optimize-images.js           # Image optimization script
│   ├── package.json                     # Mobile dependencies
│   ├── App.tsx                          # Mobile app entry point
│   ├── README.md                        # Mobile app documentation
│   ├── MOBILE_TASK_MANAGEMENT.md       # Mobile task management docs
│   ├── app.json                         # Expo configuration
│   ├── babel.config.js                  # Babel configuration
│   ├── metro.config.js                  # Metro bundler config
│   ├── react-native.config.js           # React Native configuration
│   ├── jest.config.js                   # Test configuration
│   ├── jest.setup.js                    # Jest setup configuration
│   ├── tsconfig.json                    # TypeScript configuration
│   ├── eslint.config.js                 # ESLint configuration
│   ├── Gemfile                          # Ruby dependencies
│   ├── index.js                         # Mobile app entry point
│   ├── fix-encoding.ps1                 # Encoding fix script
│   └── 📁 __tests__/                    # Mobile test files
│       └── App.test.tsx                 # App component tests
│
├── 📁 jules-scratch/                    # Development and testing utilities
│   └── 📁 verification/                 # Verification scripts
│       ├── error.png                    # Error screenshot
│       └── verify_notifications.py      # Notification verification script
│
├── 📁 .github/                          # GitHub configuration
├── 📁 .cursor/                          # Cursor IDE configuration
├── .cursorrules                         # Cursor IDE rules (2.1KB)
├── .gitignore                           # Git ignore rules (1.4KB)
├── start-all-servers.bat               # Windows server startup script
├── build-release.log                   # Build release log
├── lint . --ext .ts,.tsx,.js,.jsx      # Lint configuration
└── README.md                            # This file
```

## 🛠️ Tech Stack

### Frontend
- **React 18** with Vite for fast development
- **Tailwind CSS** for styling
- **React DnD** for drag-and-drop functionality
- **Axios** for API communication
- **React Router** for navigation
- **Date-fns** for date manipulation and timezone handling

### Backend
- **Node.js** with Express
- **Supabase** for database and authentication
- **Firebase Admin SDK** for Google Sign-In verification
- **Google AI (Gemini 2.5 Flash)** for intelligent features
- **Google OAuth** for calendar integration
- **Open-Meteo API** for weather data (free, no API key required)
- **GraphHopper API** for travel time calculations (1000 free requests/day)
- **Nodemailer** for email notifications
- **Node-cron** for background job scheduling
- **WebSocket** for real-time communication
- **Redis** for caching (via cacheService)

### Mobile
- **React Native** with Expo
- **TypeScript** for type safety
- **React Navigation** for navigation
- **AsyncStorage** for local data persistence
- **Axios** for API communication
- **Hugeicons** (@hugeicons/react-native) for icons
- **React Native Gesture Handler** for touch interactions
- **@react-native-google-signin/google-signin** for Google Sign-In
- **@react-native-firebase/auth** for Firebase authentication
- **React Native Haptic Feedback** for touch feedback
- **React Native Reanimated** for animations

### Database Schema
- **Users**: Extended Supabase auth with timezone and preferences
- **Goals**: Hierarchical structure with milestones and steps
- **Tasks**: Comprehensive task management with auto-scheduling fields
- **Calendar Events**: Google Calendar integration tracking
- **Chat History**: AI conversation tracking with intent classification
- **Auto-Scheduling**: User preferences, scheduling history, and task scheduling preferences
- **Notifications**: Comprehensive notification system with read/unread tracking
- **Conversations**: Thread-based AI conversation management
- **Google Tokens**: Secure Google OAuth token storage

### Infrastructure
- **Railway** for backend deployment
- **Vercel** for frontend deployment
- **Supabase** for database hosting
- **Firebase** for mobile authentication

## 📋 Prerequisites

Before running this application, you'll need:

1. **Node.js** (v18 or higher)
2. **Supabase** account and project
3. **Google Cloud Console** project with:
   - OAuth 2.0 credentials
   - Google AI API key
4. **Firebase** project with:
   - Firebase Admin SDK service account
   - Google Sign-In configuration
5. **Railway** account (for backend deployment)
6. **Vercel** account (for frontend deployment)

## 🔧 Environment Variables

### Backend (.env)
```env
NODE_ENV=production
PORT=5000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_AI_API_KEY=your_google_ai_api_key
CORS_ORIGIN=your_frontend_url

# Firebase Admin SDK (for Google Sign-In)
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY_ID=your_firebase_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Firebase Private Key Here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_CLIENT_ID=your_firebase_client_id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=your_firebase_client_x509_cert_url

# Security and Monitoring
TRUST_PROXY=true
SECURITY_MONITORING_ENABLED=true
CACHE_ENABLED=true
```

### Frontend (.env)
```env
VITE_API_URL=your_backend_url
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

### Mobile (.env)
```env
# Google Sign-In Configuration
GOOGLE_WEB_CLIENT_ID=your_google_web_client_id
GOOGLE_IOS_CLIENT_ID=your_google_ios_client_id
```

## 🚀 Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/mindclear.git
   cd mindclear
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   cp env.example .env
   # Edit .env with your credentials
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   cp .env.example .env
   # Edit .env with your credentials
   npm run dev
   ```

4. **Mobile Setup**
   ```bash
   cd mobile
   npm install
   # Configure Firebase and Google Sign-In
   npx expo start
   ```

### Database Setup

1. **Run the database migrations** in your Supabase SQL Editor:
   ```sql
   -- Run migrations in order from SQL/migrations/
   -- Start with the earliest timestamp and work forward
   ```

2. **Apply the full schema** (if starting fresh):
   ```sql
   -- Run the contents of SQL/schema/000_full_schema_snapshot.sql
   ```

### Production Deployment

1. **Backend (Railway)**
   - Connect your GitHub repository to Railway
   - Set root directory to `backend`
   - Add all environment variables
   - Deploy

2. **Frontend (Vercel)**
   - Import your GitHub repository to Vercel
   - Set root directory to `frontend`
   - Framework preset: Vite
   - Add environment variables
   - Deploy

3. **Google OAuth Setup**
   - Update authorized origins with your Vercel domain
   - Update redirect URIs with your Vercel domain
   - Update OAuth app name to "Mind Clear"

4. **Firebase Setup**
   - Create a Firebase project
   - Download `google-services.json` for Android
   - Download `GoogleService-Info.plist` for iOS
   - Generate Firebase Admin SDK service account key
   - Add Firebase environment variables to Railway

## 📱 Current Implementation Status

### ✅ Fully Implemented Features
- **User Authentication**: Complete Supabase auth integration with Google Sign-In
- **Google Sign-In**: Streamlined authentication flow for mobile and web
- **Goal Management**: Create, edit, delete goals with AI breakdown
- **Task Management**: Full CRUD operations with auto-scheduling
- **AI Chat Interface**: Natural language processing with Gemini 2.5 Flash
- **Calendar Integration**: Google Calendar sync with drag-and-drop
- **Auto-Scheduling System**: Complete implementation with weather and travel time
- **Notification System**: Email and in-app notifications
- **Conversation Threads**: Thread-based AI conversations
- **User Preferences**: Comprehensive scheduling preferences
- **Background Jobs**: Automated scheduling runs
- **Error Handling**: Comprehensive error handling and fallbacks
- **Security Features**: Enhanced authentication, request tracking, and security monitoring
- **Caching System**: Redis-based caching for improved performance
- **Mobile App**: Complete React Native app with offline support
- **Help System**: Interactive help overlays and guidance
- **Profile Management**: User profile screens and settings

### 🔄 In Progress
- **Performance Optimization**: Ongoing optimization of auto-scheduling algorithms
- **Mobile UI Polish**: Further mobile UI improvements and animations
- **Testing**: Comprehensive API and frontend testing
- **Error Recovery**: Enhanced error recovery and offline capabilities

### ⏳ Planned Features
- **Email Digest System**: Daily/weekly email summaries
- **Advanced Analytics**: User productivity insights
- **Team Collaboration**: Shared goals and tasks
- **Voice Commands**: Voice-activated task creation
- **Smart Notifications**: AI-powered notification timing

## 🧪 Testing

### API Testing
```bash
cd backend
npm test
```

### Frontend Testing
```bash
cd frontend
npm test
```

### Mobile Testing
```bash
cd mobile
npm test
```

### Auto-Scheduling Test
```bash
cd backend
npm run test:ai
```

## 📊 Architecture Highlights

### AI Integration
- **Gemini 2.5 Flash**: Latest Google AI model for natural language processing
- **Function Calling**: Structured API calls for goal, task, and calendar operations
- **Intent Classification**: Automatic classification of user requests
- **Conversation Context**: Thread-based conversation management

### Auto-Scheduling Intelligence
- **Weather Integration**: Real-time weather data from Open-Meteo API
- **Travel Time**: Actual travel calculations from GraphHopper API
- **Conflict Resolution**: Intelligent handling of scheduling conflicts
- **User Preferences**: Personalized scheduling based on user preferences
- **Recurring Tasks**: Automatic handling of daily, weekly, and monthly tasks

### Security & Performance
- **Enhanced Authentication**: Multi-layer authentication with Firebase integration
- **Request Tracking**: Comprehensive request monitoring and logging
- **Security Monitoring**: Real-time security threat detection
- **Caching**: Redis-based caching for improved performance
- **Token Encryption**: Secure token storage and encryption
- **CIDR Validation**: Network security validation

### Database Design
- **Row Level Security**: Comprehensive RLS policies for data protection
- **Indexing**: Optimized database indexes for performance
- **Triggers**: Automatic timestamp updates and user preference initialization
- **Views**: Dashboard views for analytics and reporting
- **Migration System**: Comprehensive migration and rollback system

### Mobile Features
- **Offline Support**: Full offline functionality with sync
- **Haptic Feedback**: Touch feedback for better user experience
- **Lazy Loading**: Optimized loading for better performance
- **Error Recovery**: Robust error handling and recovery
- **Help System**: Interactive help and guidance
- **Secure Storage**: Encrypted local storage for sensitive data

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support, email mindclear-studio@gmail.com or create an issue in this repository.

---

**Mind Clear** - Empowering productivity through intelligent assistance. 

*Built with ❤️ for users managing anxiety and depression through structured productivity.*