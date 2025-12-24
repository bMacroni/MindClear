# Mind Clear — Routines Feature PRD

**Version**: 1.0  
**Created**: December 23, 2025  
**Status**: Ready for Implementation  
**Timeline**: Phase 1 MVP in 1-2 weeks  
**Platform**: Mobile-first (React Native)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Foundation](#2-product-foundation)
3. [Technical Architecture](#3-technical-architecture)
4. [Feature Specification](#4-feature-specification)
5. [Implementation Guide](#5-implementation-guide)
6. [Testing Requirements](#6-testing-requirements)
7. [Appendix](#7-appendix)

---

## 1. Executive Summary

### 1.1 Problem Statement

Individuals with ADHD struggle to build and maintain consistent habits due to executive function challenges. Traditional task lists don't provide the structure, visibility, and dopamine reinforcement needed for habit formation. Mind Clear's existing task system handles one-off and recurring work items but lacks dedicated support for habit-building routines with flexible time windows.

### 1.2 Solution

A dedicated **Routines System** that enables users to:
- Define habits with flexible time windows (not rigid scheduling)
- Track completions with visual streak indicators
- Receive gentle reminders without shame
- Celebrate over-achievement for dopamine reinforcement

### 1.3 Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Weekly Completion Rate | 60-70% | `(completed_instances / expected_instances) × 100` per week |
| Streak Achievement | 30-day streaks | Users achieving 30+ consecutive days on ≥1 routine |
| Feature Adoption | 40%+ | % of premium subscribers creating ≥1 routine within 7 days |

### 1.4 Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Routine Types | Daily, Weekly, Monthly | Covers all common habit patterns |
| Freemium Model | 3 free, unlimited premium | Drives subscription conversion |
| Streak Grace Period | 1 miss/month/routine | Reduces shame, increases retention |
| Week Start Day | User-configurable | Respects user preference |
| Creation Flow | Quick-add with smart defaults | Reduces friction for ADHD users |
| Over-completion | Allowed and celebrated | Dopamine reinforcement |

---

## 2. Product Foundation

### 2.1 Target User Persona

**Primary Persona**: Individual with ADHD seeking structure and accountability

**Characteristics**:
- Struggles with consistency and habit formation
- Needs visual feedback and dopamine hits for motivation
- Easily discouraged by shame or rigid systems
- Benefits from low-friction interactions
- Values flexibility over strict scheduling

**User Needs**:
- Quick, one-tap completion logging
- Visual streak tracking for motivation
- Gentle reminders without judgment
- Celebration of achievements (especially over-achievement)
- Grace for occasional misses

### 2.2 Scope Boundaries

#### In Scope (v1)

- ✅ Daily, weekly, monthly routine types
- ✅ Time window preferences (morning, afternoon, evening, anytime)
- ✅ Streak tracking with visual display
- ✅ Manual completion logging (one-tap)
- ✅ Grace period system (1 miss/month/routine)
- ✅ Push notification reminders
- ✅ Over-completion tracking and celebration
- ✅ Freemium enforcement (3 free, unlimited premium)
- ✅ Quick-add creation flow

#### Out of Scope (v1)

- ❌ Social/shared routines
- ❌ AI-generated routine suggestions
- ❌ External app integrations
- ❌ Location-based triggers
- ❌ Goal integration (deferred to v2)
- ❌ Advanced gamification (badges, XP, leaderboards)
- ❌ Web platform (mobile-first)

### 2.3 Subscription Tiers

| Feature | Free Tier | Premium Tier |
|---------|-----------|--------------|
| Active Routines | 3 max | Unlimited |
| Completion Logging | ✅ | ✅ |
| Streak Tracking | ✅ | ✅ |
| Reminders | ✅ | ✅ |
| Grace Periods | ✅ | ✅ |

---

## 3. Technical Architecture

### 3.1 Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Database | PostgreSQL (Supabase) | Existing infrastructure |
| Backend | Node.js + Express | Existing pattern |
| Mobile | React Native + TypeScript | Primary platform for v1 |
| Auth | Supabase Auth | Existing system |
| Notifications | Firebase FCM | Existing notification service |

### 3.2 Database Schema

#### 3.2.1 New Enum Types

```sql
-- Routine frequency type
CREATE TYPE routine_frequency_type AS ENUM ('daily', 'weekly', 'monthly');

-- Routine time window
CREATE TYPE routine_time_window AS ENUM ('morning', 'afternoon', 'evening', 'anytime');
```

#### 3.2.2 Table: `routines`

```sql
CREATE TABLE public.routines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  frequency_type routine_frequency_type NOT NULL DEFAULT 'daily',
  target_count integer NOT NULL DEFAULT 1 CHECK (target_count >= 1 AND target_count <= 10),
  time_window routine_time_window NOT NULL DEFAULT 'anytime',
  icon text DEFAULT '📌',
  color text DEFAULT '#6366F1',
  is_active boolean NOT NULL DEFAULT true,
  reminder_enabled boolean NOT NULL DEFAULT true,
  reminder_time time without time zone,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  total_completions integer NOT NULL DEFAULT 0,
  grace_periods_remaining integer NOT NULL DEFAULT 1,
  grace_period_used_at date,
  last_completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT routines_pkey PRIMARY KEY (id),
  CONSTRAINT routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT routines_title_length CHECK (char_length(title) <= 100)
);

-- Indexes
CREATE INDEX idx_routines_user_active ON public.routines(user_id, is_active);
CREATE INDEX idx_routines_user_reminder ON public.routines(user_id, reminder_enabled, reminder_time) WHERE reminder_enabled = true;
```

#### 3.2.3 Table: `routine_completions`

```sql
CREATE TABLE public.routine_completions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL,
  user_id uuid NOT NULL,
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  period_date date NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT routine_completions_pkey PRIMARY KEY (id),
  CONSTRAINT routine_completions_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE CASCADE,
  CONSTRAINT routine_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_routine_completions_routine_period ON public.routine_completions(routine_id, period_date);
CREATE INDEX idx_routine_completions_user_date ON public.routine_completions(user_id, completed_at DESC);
```

#### 3.2.4 User Preferences Extension

```sql
-- Add to existing user_app_preferences table
ALTER TABLE public.user_app_preferences 
ADD COLUMN routine_week_start integer NOT NULL DEFAULT 1 CHECK (routine_week_start IN (0, 1));
-- 0 = Sunday, 1 = Monday
```

#### 3.2.5 Row Level Security (RLS) Policies

```sql
-- Enable RLS
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_completions ENABLE ROW LEVEL SECURITY;

-- Routines policies
CREATE POLICY "Users can view own routines" ON public.routines
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own routines" ON public.routines
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routines" ON public.routines
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own routines" ON public.routines
  FOR DELETE USING (auth.uid() = user_id);

-- Routine completions policies
CREATE POLICY "Users can view own completions" ON public.routine_completions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own completions" ON public.routine_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own completions" ON public.routine_completions
  FOR DELETE USING (auth.uid() = user_id);
```

### 3.3 API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/routines` | Create new routine | Required |
| `GET` | `/api/routines` | List all user routines with status | Required |
| `GET` | `/api/routines/:id` | Get routine details + stats | Required |
| `PUT` | `/api/routines/:id` | Update routine | Required |
| `DELETE` | `/api/routines/:id` | Soft-delete (set is_active=false) | Required |
| `POST` | `/api/routines/:id/complete` | Log a completion | Required |
| `DELETE` | `/api/routines/:id/completions/:completionId` | Undo completion | Required |
| `GET` | `/api/routines/:id/history` | Get completion history | Required |

### 3.4 API Request/Response Schemas

#### POST /api/routines

**Request Body:**
```json
{
  "title": "Drink water",
  "description": "Stay hydrated throughout the day",
  "frequency_type": "daily",
  "target_count": 1,
  "time_window": "morning",
  "icon": "💧",
  "color": "#3B82F6",
  "reminder_enabled": true,
  "reminder_time": "08:00"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "Drink water",
  "description": "Stay hydrated throughout the day",
  "frequency_type": "daily",
  "target_count": 1,
  "time_window": "morning",
  "icon": "💧",
  "color": "#3B82F6",
  "is_active": true,
  "reminder_enabled": true,
  "reminder_time": "08:00:00",
  "current_streak": 0,
  "longest_streak": 0,
  "total_completions": 0,
  "grace_periods_remaining": 1,
  "created_at": "2025-12-23T10:00:00Z",
  "updated_at": "2025-12-23T10:00:00Z"
}
```

**Error Response (403) — Free tier limit:**
```json
{
  "error": "ROUTINE_LIMIT_REACHED",
  "message": "Free tier allows 3 routines. Upgrade to Premium for unlimited routines.",
  "current_count": 3,
  "limit": 3
}
```

#### GET /api/routines

**Response (200):**
```json
{
  "routines": [
    {
      "id": "uuid",
      "title": "Drink water",
      "icon": "💧",
      "color": "#3B82F6",
      "frequency_type": "daily",
      "target_count": 1,
      "time_window": "morning",
      "current_streak": 5,
      "longest_streak": 12,
      "grace_periods_remaining": 1,
      "period_status": {
        "completions_count": 1,
        "target_count": 1,
        "is_complete": true,
        "completion_rate": 100
      }
    }
  ],
  "meta": {
    "total_count": 2,
    "active_count": 2,
    "limit": 3,
    "is_premium": false
  }
}
```

#### POST /api/routines/:id/complete

**Request Body:**
```json
{
  "notes": "Drank a full bottle!"
}
```

**Response (201):**
```json
{
  "completion": {
    "id": "uuid",
    "routine_id": "uuid",
    "completed_at": "2025-12-23T08:30:00Z",
    "period_date": "2025-12-23",
    "notes": "Drank a full bottle!"
  },
  "routine": {
    "current_streak": 6,
    "longest_streak": 12,
    "total_completions": 45,
    "period_status": {
      "completions_count": 2,
      "target_count": 1,
      "is_complete": true,
      "completion_rate": 200,
      "is_overachiever": true
    }
  },
  "celebration": {
    "type": "overachiever",
    "message": "You're on fire! 🔥 200% completed!"
  }
}
```

### 3.5 Streak Calculation Logic

#### Time Window Definitions

| Window | Start | End |
|--------|-------|-----|
| Morning | 05:00 | 12:00 |
| Afternoon | 12:00 | 17:00 |
| Evening | 17:00 | 22:00 |
| Anytime | 00:00 | 23:59 |

#### Period Boundaries (User Timezone)

| Frequency | Period Start | Period End |
|-----------|--------------|------------|
| Daily | 00:00 today | 23:59 today |
| Weekly | 00:00 on week_start_day | 23:59 on day before next week_start_day |
| Monthly | 00:00 on 1st | 23:59 on last day of month |

#### Streak Increment Rules

```
FOR EACH routine:
  current_period = get_current_period(frequency_type, user_timezone, week_start_day)
  completions_in_period = count_completions(routine_id, current_period)
  
  IF completions_in_period >= target_count:
    // Period is complete, streak continues
    streak_status = "active"
  ELSE IF period_has_ended AND completions_in_period < target_count:
    IF grace_periods_remaining > 0:
      // Use grace period
      grace_periods_remaining -= 1
      grace_period_used_at = today
      streak_status = "saved_by_grace"
    ELSE:
      // Streak breaks
      current_streak = 0
      streak_status = "broken"
```

#### Grace Period Reset

```
ON first day of each month:
  FOR EACH routine WHERE user_id = current_user:
    SET grace_periods_remaining = 1
    SET grace_period_used_at = NULL
```

### 3.6 Notification Service Extension

**New Function in `notificationService.js`:**

```javascript
/**
 * Send routine reminder notification
 * @param {string} userId - User ID
 * @param {object} routine - Routine object
 */
async function sendRoutineReminder(userId, routine) {
  const notification = {
    notification_type: 'routine_reminder',
    title: `Time for: ${routine.title}`,
    message: getMotivationalMessage(routine.current_streak),
    details: {
      routine_id: routine.id,
      routine_title: routine.title,
      current_streak: routine.current_streak
    }
  };
  
  await sendNotification(userId, notification);
}

function getMotivationalMessage(streak) {
  if (streak === 0) return "Start your streak today! 🌱";
  if (streak < 7) return `Keep going! ${streak}-day streak 🔥`;
  if (streak < 30) return `Amazing! ${streak}-day streak! 💪`;
  return `Incredible ${streak}-day streak! You're unstoppable! 🏆`;
}
```

---

## 4. Feature Specification

### 4.1 User Stories — Phase 1 (MVP)

---

#### US-01: Create a Routine (Quick-Add)

**As** an ADHD individual  
**I want** to quickly create a routine  
**So that** I can start building a habit with minimal friction

**Acceptance Criteria:**

- [ ] User can tap "+" button to open quick-add modal
- [ ] Required field: Title (text input, max 100 chars)
- [ ] Required field: Frequency (Daily/Weekly/Monthly selector)
- [ ] "Create" button saves with smart defaults
- [ ] Smart defaults applied:
  - Target count: 1
  - Time window: Anytime
  - Reminder: Enabled at window default time
  - Icon: 📌 (or keyword-matched)
  - Color: Random from palette
- [ ] Optional "Customize" link expands full form
- [ ] Full form reveals: target count, time window, icon, color, reminder time
- [ ] Validation: Title cannot be empty
- [ ] Validation: Free users limited to 3 routines
- [ ] On limit reached: Show upgrade prompt
- [ ] Success: Routine appears in list, toast shown

**Default Reminder Times by Window:**
- Morning: 08:00
- Afternoon: 13:00
- Evening: 19:00
- Anytime: 09:00

---

#### US-02: View Routines List

**As** an ADHD individual  
**I want** to see all my routines with today's status  
**So that** I know which habits need attention

**Acceptance Criteria:**

- [ ] Screen title: "Routines"
- [ ] Shows all active routines as cards
- [ ] Each card displays:
  - Icon and title
  - Current streak with flame emoji (e.g., "🔥 5 days")
  - Progress indicator: "1/1 ✓" or "2/3"
  - Visual completion state (muted when complete)
- [ ] Sort order:
  1. Incomplete routines first
  2. By time window (Morning → Afternoon → Evening → Anytime)
  3. Alphabetically within same window
- [ ] Empty state: "No routines yet. Create your first habit!"
- [ ] Pull-to-refresh updates data
- [ ] FAB (floating action button) for "+" add routine
- [ ] Shows routine count: "2 of 3 routines" for free users

---

#### US-03: Log a Completion

**As** an ADHD individual  
**I want** to log a routine completion with one tap  
**So that** I get immediate feedback and dopamine

**Acceptance Criteria:**

- [ ] Tapping routine card logs completion
- [ ] Optimistic UI update (instant visual feedback)
- [ ] Completion timestamp: current time
- [ ] Period date: today (in user timezone)
- [ ] Success feedback:
  - Checkmark animation
  - Haptic feedback (if supported)
  - Streak count updates
- [ ] If completion exceeds target:
  - Show "bonus" indicator
  - Display completion rate (e.g., "200%")
  - Celebration animation (confetti or sparkles)
- [ ] Card visual state changes to "complete"
- [ ] Undo option: Swipe or long-press reveals undo
- [ ] API error: Rollback optimistic update, show error toast

---

#### US-04: View Current Streak

**As** an ADHD individual  
**I want** to see my current streak  
**So that** I feel motivated to maintain it

**Acceptance Criteria:**

- [ ] Streak displayed on routine card: "🔥 X days/weeks/months"
- [ ] Streak label matches frequency type:
  - Daily: "X days"
  - Weekly: "X weeks"
  - Monthly: "X months"
- [ ] Streak of 0: Show "🌱 Start today!" (not "0 days")
- [ ] Tapping card opens detail view with:
  - Current streak (large)
  - Longest streak (personal best)
  - Total completions (lifetime)
  - Grace periods remaining (X/1)
- [ ] Milestone celebrations:
  - 7-day streak: "🎉 One week!"
  - 30-day streak: "🏆 One month!"
  - 100-day streak: "💯 Incredible!"

---

#### US-05: Receive Routine Reminder

**As** an ADHD individual  
**I want** to receive a reminder for my routine  
**So that** I don't forget

**Acceptance Criteria:**

- [ ] Reminders enabled by default on routine creation
- [ ] Reminder time defaults to window-based time
- [ ] User can customize reminder time per routine
- [ ] User can disable reminders per routine
- [ ] Push notification content:
  - Title: "Time for: [Routine Title]"
  - Body: Motivational message based on streak
- [ ] Notification actions:
  - Tap: Opens app to routines screen
  - (Future: Quick complete from notification)
- [ ] Respects device notification settings
- [ ] No reminder sent if routine already completed today

---

### 4.2 User Stories — Phase 2 (Post-MVP)

#### US-06: Grace Period System

**Acceptance Criteria:**
- [ ] Each routine has 1 grace period per month
- [ ] Grace auto-applies when period missed
- [ ] User notified: "Grace period saved your streak! 🛡️"
- [ ] Grace indicator shows remaining (1/1 or 0/1)
- [ ] Grace resets on 1st of each month
- [ ] When no grace and period missed:
  - Streak resets to 0
  - Message: "Streak reset. Every day is a fresh start! 🌱"

#### US-07: Edit Routine

**Acceptance Criteria:**
- [ ] User can edit: title, description, target count, time window, icon, color, reminder settings
- [ ] Cannot change frequency type (would break streak logic)
- [ ] Changes take effect immediately
- [ ] Streak preserved on edit

#### US-08: Completion History

**Acceptance Criteria:**
- [ ] Calendar view showing past 90 days
- [ ] Heat map coloring (intensity = completion count)
- [ ] Tap day to see completions with timestamps
- [ ] Summary stats: total completions, average completion rate

---

## 5. Implementation Guide

### 5.1 File Structure

```
backend/
├── src/
│   ├── controllers/
│   │   └── routinesController.js      # NEW: Routines CRUD + completions
│   ├── routes/
│   │   └── routines.js                # NEW: Route definitions
│   ├── services/
│   │   └── routineStreakService.js    # NEW: Streak calculation logic
│   └── utils/
│       └── routineUtils.js            # NEW: Period calculations, defaults

mobile/
├── src/
│   ├── screens/
│   │   ├── RoutinesScreen.tsx         # NEW: Main routines list
│   │   └── RoutineDetailScreen.tsx    # NEW: Detail view with stats
│   ├── components/
│   │   ├── routines/
│   │   │   ├── RoutineCard.tsx        # NEW: Routine card component
│   │   │   ├── RoutineQuickAdd.tsx    # NEW: Quick-add modal
│   │   │   ├── StreakDisplay.tsx      # NEW: Streak visualization
│   │   │   └── CompletionAnimation.tsx # NEW: Celebration animations
│   ├── services/
│   │   └── routineService.ts          # NEW: API client
│   └── stores/
│       └── routineStore.ts            # NEW: State management

SQL/
└── migrations/
    └── 2025-12-23_0043_routines_feature.sql  # NEW: Schema migration
```

### 5.2 Implementation Order

```
Week 1: Foundation
├── Day 1-2: Database
│   ├── Create migration file
│   ├── Run migration on Supabase
│   ├── Verify RLS policies
│   └── Test with Supabase dashboard
├── Day 3-4: Backend
│   ├── Create routinesController.js
│   ├── Implement CRUD endpoints
│   ├── Implement completion logging
│   ├── Add subscription check middleware
│   └── Create routes/routines.js
├── Day 5-7: Mobile
│   ├── Create RoutinesScreen.tsx
│   ├── Create RoutineCard.tsx
│   ├── Create RoutineQuickAdd.tsx
│   ├── Implement routineService.ts
│   ├── Add to navigation
│   └── Implement completion tap

Week 2: Polish & Test
├── Day 8-9: Streak Logic
│   ├── Implement routineStreakService.js
│   ├── Add streak calculation to GET endpoints
│   ├── Create StreakDisplay.tsx
│   └── Unit tests for streak calculation
├── Day 10-11: Notifications
│   ├── Extend notificationService.js
│   ├── Create reminder scheduler
│   └── Test push notifications
├── Day 12-14: Testing & Fixes
│   ├── Manual testing all flows
│   ├── Fix bugs
│   ├── Performance optimization
│   └── Code review
```

### 5.3 Backend Implementation Details

#### routinesController.js — Core Functions

```javascript
// Function signatures for implementation

/**
 * Create a new routine
 * - Validates subscription tier for routine limit
 * - Applies smart defaults for quick-add
 */
export async function createRoutine(req, res) { }

/**
 * Get all routines for user with current period status
 * - Calculates period completions for each routine
 * - Returns sorted by completion status and time window
 */
export async function getRoutines(req, res) { }

/**
 * Get single routine with full stats
 * - Includes streak info, grace periods, completion history
 */
export async function getRoutineById(req, res) { }

/**
 * Update routine settings
 * - Cannot change frequency_type
 */
export async function updateRoutine(req, res) { }

/**
 * Soft delete routine (set is_active = false)
 */
export async function deleteRoutine(req, res) { }

/**
 * Log a completion
 * - Creates completion record
 * - Updates streak counters
 * - Returns celebration data if overachiever
 */
export async function logCompletion(req, res) { }

/**
 * Undo a completion
 * - Deletes completion record
 * - Recalculates streak
 */
export async function removeCompletion(req, res) { }
```

#### Subscription Check Middleware

```javascript
// Add to routinesController.js or separate middleware

async function checkRoutineLimit(userId, supabase) {
  // Get user subscription tier
  const { data: user } = await supabase
    .from('users')
    .select('subscription_tier')
    .eq('id', userId)
    .single();
  
  const isPremium = user?.subscription_tier === 'premium';
  
  if (isPremium) {
    return { allowed: true, limit: null };
  }
  
  // Count active routines for free user
  const { count } = await supabase
    .from('routines')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true);
  
  const FREE_LIMIT = 3;
  
  return {
    allowed: count < FREE_LIMIT,
    current_count: count,
    limit: FREE_LIMIT,
    is_premium: false
  };
}
```

### 5.4 Mobile Implementation Details

#### Navigation Integration

Add to `TabNavigator.tsx`:

```typescript
// Add Routines tab between existing tabs
{
  name: 'Routines',
  component: RoutinesScreen,
  options: {
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="repeat" size={size} color={color} />
    ),
  },
}
```

#### RoutineCard Component Structure

```typescript
interface RoutineCardProps {
  routine: Routine;
  onPress: () => void;
  onComplete: () => void;
}

// Visual states:
// - incomplete: Full color, prominent
// - complete: Muted/checked, celebration if overachiever
// - overachiever: Special glow/badge
```

#### Quick-Add Modal Flow

```
1. User taps FAB "+"
2. Modal slides up with:
   - Title input (auto-focused)
   - Frequency pills (Daily | Weekly | Monthly)
   - "Create" button
   - "Customize ▾" expandable
3. On "Create":
   - Apply smart defaults
   - Call POST /api/routines
   - Close modal
   - Show success toast
   - New routine appears in list
```

---

## 6. Testing Requirements

### 6.1 Unit Tests — Critical Paths

| Test Suite | Priority | Coverage |
|------------|----------|----------|
| Streak Calculation | P0 | Daily, weekly, monthly logic |
| Period Boundary | P0 | Timezone edge cases |
| Grace Period | P1 | Auto-apply, reset, messaging |
| Subscription Limit | P0 | Free tier enforcement |
| Completion Logging | P0 | Create, update streaks, undo |

### 6.2 Streak Calculation Test Cases

```javascript
describe('StreakCalculation', () => {
  describe('Daily routines', () => {
    it('increments streak when completing today', () => {});
    it('preserves streak when already completed today', () => {});
    it('uses grace period when yesterday was missed', () => {});
    it('breaks streak when missed and no grace remaining', () => {});
    it('handles timezone boundary correctly', () => {});
  });
  
  describe('Weekly routines', () => {
    it('increments streak when meeting weekly target', () => {});
    it('tracks partial progress within week', () => {});
    it('respects user week start preference', () => {});
    it('handles week boundary crossing', () => {});
  });
  
  describe('Monthly routines', () => {
    it('increments streak when meeting monthly target', () => {});
    it('handles months with different day counts', () => {});
  });
  
  describe('Grace periods', () => {
    it('auto-applies grace when period missed', () => {});
    it('resets grace on first of month', () => {});
    it('does not apply grace if already used this month', () => {});
  });
});
```

### 6.3 Manual Test Checklist

#### Routine Creation
- [ ] Create routine with just title + frequency (quick-add)
- [ ] Verify smart defaults applied correctly
- [ ] Create routine with all custom fields
- [ ] Try to create 4th routine on free tier → upgrade prompt
- [ ] Create routine as premium user → no limit

#### Completion Logging
- [ ] Tap to complete → instant UI update
- [ ] Verify completion persists after app restart
- [ ] Complete multiple times → over-completion shown
- [ ] Undo completion → streak recalculates

#### Streak Display
- [ ] New routine shows "Start today!" (not 0)
- [ ] Complete daily routine → streak shows 1 day
- [ ] Miss a day with grace → streak preserved
- [ ] Miss a day without grace → streak resets with kind message

#### Notifications
- [ ] Routine with reminder → notification received at time
- [ ] Already completed routine → no notification sent
- [ ] Disabled reminder → no notification

---

## 7. Appendix

### 7.1 Smart Defaults Reference

| Field | Default Value | Notes |
|-------|---------------|-------|
| `target_count` | 1 | Single completion per period |
| `time_window` | anytime | No time restriction |
| `icon` | 📌 | Override with keyword matching |
| `color` | Random from palette | #6366F1, #8B5CF6, #EC4899, #F59E0B, #10B981 |
| `reminder_enabled` | true | Encourage engagement |
| `reminder_time` | Window-based | See table below |
| `is_active` | true | Visible immediately |
| `current_streak` | 0 | No history yet |
| `grace_periods_remaining` | 1 | Full grace available |

### 7.2 Icon Keyword Matching

```javascript
const iconKeywords = {
  'water': '💧',
  'drink': '💧',
  'exercise': '🏃',
  'workout': '💪',
  'gym': '🏋️',
  'read': '📚',
  'book': '📖',
  'meditate': '🧘',
  'sleep': '😴',
  'wake': '⏰',
  'teeth': '🦷',
  'brush': '🪥',
  'vitamin': '💊',
  'medicine': '💊',
  'walk': '🚶',
  'run': '🏃',
  'piano': '🎹',
  'guitar': '🎸',
  'music': '🎵',
  'write': '✍️',
  'journal': '📓',
  'clean': '🧹',
  'cook': '🍳',
  'meal': '🍽️',
  'study': '📝',
  'code': '💻',
  'stretch': '🤸',
  'yoga': '🧘',
  'pray': '🙏',
  'call': '📞',
  'family': '👨‍👩‍👧‍👦',
  'pet': '🐕',
  'dog': '🐕',
  'cat': '🐱',
  'plant': '🌱',
  'garden': '🌻',
  'lawn': '🌿',
};
```

### 7.3 Celebration Messages

```javascript
const celebrationMessages = {
  firstCompletion: "Great start! Your journey begins! 🌱",
  streakMilestones: {
    3: "3-day streak! You're building momentum! 🔥",
    7: "One week strong! Incredible! 🎉",
    14: "Two weeks! You're making this a habit! 💪",
    21: "21 days! Scientists say it's official now! 🧠",
    30: "One month! You're unstoppable! 🏆",
    60: "Two months! This is who you are now! ⭐",
    100: "💯 DAYS! LEGENDARY! 🦸",
  },
  overachiever: {
    150: "150%! Overachiever alert! 🔥",
    200: "200%! You're on fire! 🚀",
    300: "300%! Absolute beast mode! 💎",
  },
  graceSaved: "Grace period saved your streak! 🛡️",
  streakReset: "Streak reset. Every day is a fresh start! 🌱",
};
```

### 7.4 Error Messages

| Error Code | User Message |
|------------|--------------|
| `ROUTINE_LIMIT_REACHED` | "You've reached the free limit of 3 routines. Upgrade to Premium for unlimited routines!" |
| `ROUTINE_NOT_FOUND` | "Routine not found. It may have been deleted." |
| `COMPLETION_FAILED` | "Couldn't log completion. Please try again." |
| `NETWORK_ERROR` | "Connection issue. Your completion will sync when back online." |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-23 | AI + Product Owner | Initial PRD |

---

*This PRD is optimized for LLM-assisted development. Each section provides sufficient context for implementation without requiring additional clarification.*
