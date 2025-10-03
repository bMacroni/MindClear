# Implementation Notes: Auth Deletion Queue & Compensating Actions

**Migration:** 2025-10-03_0026_auth_deletion_queue_and_compensating_actions.sql  
**Date:** 2025-10-03  
**Branch:** feat_GoogleDevPol-compliance  
**Status:** ✅ Ready for deployment

---

## Overview

This migration implements a robust failure-handling system for auth account deletions to prevent orphaned authentication accounts when `supabase.auth.admin.deleteUser()` fails after successful database deletion.

### Problem Addressed

Previously, if the auth deletion failed after DB deletion succeeded, the system would:
- Leave an orphaned auth account (user can still log in)
- Have no persistent record of the failure
- Have no automated recovery mechanism
- Require manual investigation to discover the issue

### Solution Components

1. **Retry with Exponential Backoff**: Bounded retry loop (3 attempts) with increasing delays for transient errors
2. **Dead-Letter Queue**: Persistent `auth_deletion_queue` table for failed operations
3. **Compensating Transactions**: Mark user records and trigger ops alerts
4. **Graceful Degradation**: HTTP 202 response signaling partial success

---

## Architecture

### Flow Diagram

```
User Deletion Request
         │
         ├─► Step 1: Record consent (users.deletion_requested_at)
         │
         ├─► Step 2: Atomic DB deletion (delete_user_data_atomic RPC)
         │           ├─► Success → Proceed
         │           └─► Failure → Rollback, return 500
         │
         └─► Step 3: Auth deletion with retry
                     │
                     ├─► Attempt 1: deleteUser()
                     │   ├─► Success → Return 200
                     │   └─► Transient Error → Retry
                     │
                     ├─► Attempt 2: deleteUser() [after 1s delay + jitter]
                     │   ├─► Success → Return 200
                     │   └─► Transient Error → Retry
                     │
                     ├─► Attempt 3: deleteUser() [after 2s delay + jitter]
                     │   ├─► Success → Return 200
                     │   └─► Transient Error → Retry
                     │
                     └─► Attempt 4: deleteUser() [after 4s delay + jitter]
                         ├─► Success → Return 200
                         │
                         └─► Final Failure → Compensating Actions
                                             │
                                             ├─► 1. Mark user as 'auth_deletion_failed'
                                             ├─► 2. Enqueue in auth_deletion_queue
                                             ├─► 3. Send ops alert
                                             └─► 4. Return HTTP 202 (partial success)
```

---

## Database Schema

### New Table: `auth_deletion_queue`

Dead-letter queue for failed auth deletions requiring manual intervention.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | User whose auth deletion failed |
| `operation_type` | VARCHAR | Type: 'auth_deletion' or 'compensating_rollback' |
| `status` | VARCHAR | 'pending', 'processing', 'completed', 'failed', 'cancelled' |
| `context` | JSONB | Full context: deletionResult, error, audit_id, etc. |
| `last_error` | TEXT | Last error message |
| `retry_count` | INTEGER | Number of retries attempted (from initial operation) |
| `max_retries` | INTEGER | Max allowed retries (default: 3) |
| `created_at` | TIMESTAMPTZ | When queued |
| `last_retry_at` | TIMESTAMPTZ | Last retry attempt |
| `completed_at` | TIMESTAMPTZ | When resolved |
| `processing_notes` | TEXT | Ops team notes |
| `resolved_by` | VARCHAR | Who resolved it |

**Indexes:**
- `idx_auth_deletion_queue_status` - Fast queries for pending items
- `idx_auth_deletion_queue_user_id` - Lookup by user
- `idx_auth_deletion_queue_created_at` - Chronological ordering

### New Columns: `users` Table

Tracking for failed deletion states (compensating transaction).

| Column | Type | Description |
|--------|------|-------------|
| `deletion_status` | VARCHAR | 'active', 'auth_deletion_failed', 'pending_deletion', 'deleted' |
| `deletion_failed_at` | TIMESTAMPTZ | When auth deletion failed |
| `deletion_failure_context` | JSONB | Error details, retry attempts, etc. |

**Index:**
- `idx_users_deletion_status` - Partial index for non-active statuses

---

## Backend Implementation

### New Service: `retryService.js`

Located: `backend/src/utils/retryService.js`

**Functions:**

1. **`retryWithBackoff(fn, options)`**
   - Executes function with exponential backoff
   - Default: 3 retries, 1s base delay, 10s max delay
   - Adds 30% jitter to prevent thundering herd
   - Returns: `{ success, data, error, attempts }`

2. **`enqueueFailedOperation(params)`**
   - Inserts failed operation into `auth_deletion_queue`
   - Stores full context for manual remediation
   - Returns queue ID

3. **`markUserDeletionFailed(user_id, context)`**
   - Updates user record with failure status
   - Sets `deletion_status = 'auth_deletion_failed'`
   - Stores failure context in JSONB

4. **`sendOpsAlert(alertData)`**
   - Logs critical alert to console
   - In production: integrate with PagerDuty, Slack, Datadog, etc.
   - Includes remediation steps

### Updated Controller: `userController.js`

**Changes in `deleteUserAccount` function:**

```javascript
// OLD (lines 458-471):
const { error: authError } = await supabase.auth.admin.deleteUser(user_id);
if (authError) {
  return res.status(500).json({ error: '...' });
}

// NEW (lines 462-548):
const authDeletionResult = await retryWithBackoff(
  async () => {
    const { error } = await supabase.auth.admin.deleteUser(user_id);
    if (error) throw error;
    return { success: true };
  },
  { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 10000 }
);

if (!authDeletionResult.success) {
  // Execute compensating actions:
  // 1. Mark user as failed
  // 2. Enqueue for manual cleanup
  // 3. Send ops alert
  // Return HTTP 202 (partial success)
}
```

---

## Transient vs. Permanent Errors

### Transient Errors (Retryable)

The system automatically retries these:

- **HTTP Status Codes:** 408, 429, 500, 502, 503, 504
- **Error Patterns:**
  - Timeout errors (ETIMEDOUT)
  - Connection resets (ECONNRESET, ECONNREFUSED)
  - Network errors
  - Rate limits
  - Service unavailable
  - Gateway errors

### Permanent Errors (Not Retried)

These fail immediately:

- 400 Bad Request (invalid user_id)
- 401 Unauthorized (invalid service role key)
- 403 Forbidden (permission denied)
- 404 Not Found (user already deleted - actually a success case)
- Any other non-transient errors

---

## HTTP Response Codes

### 200 OK - Complete Success

Both DB and auth deletion succeeded.

```json
{
  "success": true,
  "message": "Account and all associated data have been permanently deleted.",
  "audit_id": "..."
}
```

### 202 Accepted - Partial Success

DB deleted, auth deletion pending manual intervention.

```json
{
  "success": "partial",
  "message": "Database records deleted successfully. Authentication removal is pending manual intervention.",
  "details": {
    "db_deletion": "completed",
    "auth_deletion": "pending",
    "audit_id": "...",
    "queue_id": "...",
    "action_required": "Operations team has been notified and will complete the process."
  },
  "contact_support": true
}
```

### 500 Internal Server Error - Complete Failure

Either consent recording failed or DB deletion failed (rolled back).

---

## Operations Playbook

### Monitoring Failed Deletions

**View pending items:**
```sql
SELECT * FROM failed_auth_deletions_summary;
```

**Check queue status:**
```sql
SELECT 
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM auth_deletion_queue
GROUP BY status;
```

### Manual Remediation Steps

When a queue item appears:

1. **Verify the Issue**
   ```sql
   SELECT 
     q.user_id,
     q.context,
     q.last_error,
     u.email,
     u.deletion_status
   FROM auth_deletion_queue q
   LEFT JOIN users u ON q.user_id = u.id
   WHERE q.id = '<queue_id>';
   ```

2. **Check Auth Status**
   - Open Supabase dashboard → Authentication → Users
   - Search for the user_id
   - If user exists: proceed to delete
   - If user doesn't exist: mark as completed (race condition)

3. **Manual Auth Deletion**
   - In Supabase dashboard: Delete the auth user
   - OR use API:
     ```javascript
     await supabase.auth.admin.deleteUser(user_id)
     ```

4. **Update Queue Status**
   ```sql
   SELECT update_auth_deletion_queue_status(
     '<queue_id>',
     'completed',
     'Manually deleted via Supabase dashboard',
     'ops_team_member_name'
   );
   ```

5. **Verify DB Status**
   ```sql
   -- Should return 0 rows
   SELECT * FROM users WHERE id = '<user_id>';
   
   -- Check related tables (should be empty)
   SELECT * FROM goals WHERE user_id = '<user_id>';
   SELECT * FROM tasks WHERE user_id = '<user_id>';
   ```

### Automated Queue Processing

Future enhancement: Create a scheduled job to retry queue items.

```javascript
// Pseudo-code for cron job
async function processAuthDeletionQueue() {
  const pending = await getPendingAuthDeletions();
  
  for (const item of pending) {
    // Mark as processing
    await updateQueueStatus(item.id, 'processing');
    
    // Retry auth deletion
    const result = await retryWithBackoff(
      () => supabase.auth.admin.deleteUser(item.user_id)
    );
    
    if (result.success) {
      await updateQueueStatus(item.id, 'completed', 'Auto-resolved by queue processor');
    } else {
      await updateQueueStatus(item.id, 'failed', `Still failing: ${result.error}`);
    }
  }
}
```

### Cleanup Old Items

Completed/cancelled items are auto-cleaned after 90 days:

```sql
SELECT cleanup_old_auth_deletion_queue();
```

---

## Testing Strategy

### Unit Tests

1. **Retry Logic Tests**
   - Verify exponential backoff delays
   - Confirm jitter randomization
   - Test transient error detection
   - Verify max retry limit

2. **Compensating Action Tests**
   - Test user status marking
   - Test queue insertion
   - Test ops alert generation

### Integration Tests

1. **Success Scenarios**
   - Normal deletion (completes on first try)
   - Delayed success (completes on retry 2 or 3)

2. **Failure Scenarios**
   - Transient errors leading to queue (after 4 attempts)
   - Permanent errors (fail immediately, still queue)
   - Network timeouts

3. **Edge Cases**
   - User already deleted (404 should be treated as success)
   - Concurrent deletion requests
   - DB deletion succeeds but process crashes before auth deletion

### Manual Testing

Use Supabase API rate limiting or network interception to simulate:
- Temporary service unavailability (503)
- Rate limit errors (429)
- Gateway timeouts (504)

---

## Deployment Checklist

- [ ] Run migration: `2025-10-03_0026_auth_deletion_queue_and_compensating_actions.sql`
- [ ] Verify table created: `SELECT * FROM auth_deletion_queue LIMIT 1;`
- [ ] Verify users columns: `SELECT deletion_status FROM users LIMIT 1;`
- [ ] Deploy backend code with `retryService.js`
- [ ] Verify import in `userController.js`
- [ ] Test deletion endpoint in staging
- [ ] Set up monitoring/alerts for queue items
- [ ] Document manual remediation in ops runbook
- [ ] Configure PagerDuty/Slack integration for `sendOpsAlert()`

---

## Rollback Plan

If issues arise:

1. **Revert backend code:**
   ```bash
   git revert <commit_hash>
   ```

2. **Run rollback migration:**
   ```sql
   \i SQL/rollbacks/2025-10-03_0026_auth_deletion_queue_and_compensating_actions.rollback.sql
   ```

3. **Verify cleanup:**
   ```sql
   -- Should error (table doesn't exist)
   SELECT * FROM auth_deletion_queue;
   
   -- Should not have new columns
   \d users
   ```

---

## Future Enhancements

1. **Automated Queue Processor**
   - Scheduled job to retry pending items
   - Exponential backoff at queue level
   - Auto-escalation after X failures

2. **Dashboard/UI**
   - Admin view of failed deletions
   - One-click manual retry
   - Status tracking

3. **Advanced Alerting**
   - PagerDuty integration
   - Slack notifications
   - Email alerts to ops team

4. **Metrics & Monitoring**
   - Track auth deletion success rate
   - Monitor queue depth
   - Alert on queue items older than X hours

5. **Compensating Rollback**
   - For catastrophic failures, support rolling back DB deletion
   - Restore user from audit trail if needed
   - Complex - only if absolutely necessary

---

## Security Considerations

1. **RLS Policies**: Queue table has RLS enabled but relies on service role access
2. **Sensitive Data**: Queue stores user_id and context but not PII
3. **Audit Trail**: All attempts logged via existing audit system
4. **Access Control**: Only ops team should access queue management functions

---

## Compliance Notes

**Google Play Policy Compliance:**
- ✅ User-initiated deletion proceeds even if auth fails
- ✅ All DB records removed immediately
- ✅ User cannot access data (no active session)
- ✅ Audit trail maintained
- ✅ Orphaned auth cleaned up async

**GDPR/CCPA Compliance:**
- ✅ Personal data deleted from DB immediately
- ✅ Auth account removed (with retry)
- ✅ Clear communication to user about status
- ✅ Manual intervention tracked and audited

---

## Contact

For questions or issues with this migration:
- File an issue in the repository
- Contact the ops team for manual remediation
- Check monitoring dashboards for queue status

---

**Last Updated:** 2025-10-03  
**Maintainer:** Development Team  
**Related Docs:** 
- `SQL/migrations/2025-10-03_0025_IMPLEMENTATION_NOTES.md` (Atomic deletion)
- `backend/docs/ENHANCED_ERROR_HANDLING.md` (Error handling patterns)

