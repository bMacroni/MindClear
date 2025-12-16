# Feature PRD: Task Schema Fix for Auto-Schedule

## 1. Product Foundation

### Product Purpose
Fix a critical crash during data synchronization caused by a mismatch between the Task model definition and the database schema. The application crashes when trying to set the `autoScheduleEnabled` property because the corresponding `auto_schedule_enabled` column is missing from the local database schema.

### Success Metrics
1.  **Crash Resolution**: The `TypeError: Cannot read property 'type' of undefined` error during sync disappears.
2.  **Data Integrity**: The `autoScheduleEnabled` field can be successfully persisted and retrieved for Tasks.
3.  **Sync Reliability**: Users can complete a full data sync (login/pull) without errors.

### Target Users
*   **All Users**: Affects anyone syncing data, especially when duplicate task resolution occurs.

### Scope Boundaries
*   **In Scope**: Updating WatermelonDB schema, adding a migration, and bumping the schema version.
*   **Out of Scope**: Changing the behavior of auto-scheduling itself.

## 2. Technical Architecture

### Technology Stack
*   **Database**: WatermelonDB (SQLite/JSI)
*   **Language**: TypeScript

### System Architecture
1.  **Schema Definition**: Defines the structure of the local SQLite database.
2.  **Migrations**: Handles upgrading the database schema on existing installations without data loss.
3.  **Model Layer**: TypeScript class definitions that map to the schema.

### External Dependencies
*   None.

### Performance Requirements
*   Migration should run quickly on startup.

### Security Considerations
*   None.

## 3. Feature Specification

### Core Features
1.  **Schema Update**: Add `auto_schedule_enabled` (boolean, optional) to the `tasks` table in `schema.ts`.
2.  **Migration**: Create a version 6 migration to add this column to existing databases.

### Feature Priority
*   **P0**: Critical Bug Fix.

### User Stories
*   As a **User**, I want to log in and sync my data without the app crashing, so that I can access my tasks.

### Acceptance Criteria
*   **Given**: An existing app installation with database version 5.
*   **When**: The app updates and starts.
*   **Then**: The database migrates to version 6, adding the `auto_schedule_enabled` column to the `tasks` table.
*   **When**: A sync occurs and triggers duplicate task resolution (which writes to `autoScheduleEnabled`).
*   **Then**: The operation completes successfully without throwing a TypeError.

### Feature Dependencies
*   None.

## 4. Implementation Constraints

### Resource Constraints
*   Must rely on WatermelonDB's migration system.

### Technical Constraints
*   Column names must match the `@field` decorator in `Task.ts` (`auto_schedule_enabled`).

## 5. Development Roadmap

### Phase 1: Implementation
*   **Step 1**: Update `mobile/src/db/schema.ts` (version 6, add column).
*   **Step 2**: Update `mobile/src/db/migrations/schemaMigrations.ts` (add step to version 6).
*   **Step 3**: Verify `Task.ts` model definition matches (already done, verified).

### Risk Assessment
*   **Risk**: If the migration fails, the app might be stuck in an unstable state.
*   **Mitigation**: Standard WatermelonDB migration safety. The change is a simple column addition, which is low risk.

