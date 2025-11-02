# TaskRepository Test Suite

## Overview

This directory contains comprehensive test suites for the TaskRepository to ensure all task operations work correctly with the local-first architecture.

## Test Files

### `TaskRepository.comprehensive.test.ts`
Comprehensive tests covering all task operations:

- **Task Creation**: Creating tasks with different lifecycle statuses, validating combined status format
- **Task Updates**: Updating tasks while preserving lifecycle status in combined format
- **Status Management**: Toggling between not_started, in_progress, and completed
- **Focus Management**: Setting/unsetting focus tasks while preserving lifecycle status
- **Deletion**: Soft deletion with pending_delete status
- **Combined Status Format**: Handling `pending_create:<status>` and `pending_update:<status>` formats
- **Edge Cases**: Null values, multiple updates, focus changes with status updates

### Key Test Scenarios

1. **Combined Status Format**
   - `pending_create:not_started` when creating new tasks
   - `pending_update:completed` when updating task status
   - Preservation of lifecycle status when updating other fields

2. **Status Transitions**
   - not_started → in_progress → completed
   - completed → not_started (reset)
   - Preserving status when updating title/description

3. **Focus Management**
   - Setting task as focus unsets other focus tasks
   - Preserving lifecycle status when setting/unsetting focus

4. **Error Handling**
   - Non-existent tasks throw "Task not found"
   - Invalid dates are rejected
   - Deletion is idempotent

## Running Tests

```bash
cd mobile
npm test TaskRepository.comprehensive.test.ts
```

## Status Format

The TaskRepository uses a combined status format to store both sync status and lifecycle status in a single field:

- `pending_create:not_started` - New task, not started
- `pending_create:in_progress` - New task, in progress
- `pending_create:completed` - New task, completed
- `pending_update:not_started` - Updated task, not started
- `pending_update:in_progress` - Updated task, in progress
- `pending_update:completed` - Updated task, completed
- `pending_delete` - Task marked for deletion

The SyncService extracts the lifecycle status (after the colon) when pushing to the server.

## Notes

- Tests use the real TaskRepository instance, not mocks
- Database is cleared before each test
- Auth service is mocked to return a test user ID
- Tests verify both the status format and the actual task data
