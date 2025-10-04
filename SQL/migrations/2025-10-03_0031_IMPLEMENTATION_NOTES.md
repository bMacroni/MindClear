# Migration 0031: Atomic deletion_requested_at Timestamp

## Problem Statement

The previous implementation had a critical consistency issue:

1. **Controller** (userController.js lines 418-434): Updated `users.deletion_requested_at` outside the transaction
2. **RPC**: Called `delete_user_data_atomic()` in a separate transaction
3. **Issue**: If the RPC failed for any reason, the `deletion_requested_at` timestamp remained set, creating an inconsistent "consent recorded but deletion failed" state

### Failure Scenario
```
1. Controller sets deletion_requested_at = NOW() ✓
2. Controller calls delete_user_data_atomic()
3. RPC encounters error (DB constraint, etc.) ✗
4. RPC transaction rolls back ✓
5. BUT deletion_requested_at remains set ✗ <- INCONSISTENT STATE
```

## Solution

Moved the `deletion_requested_at` update **inside** the `delete_user_data_atomic` stored procedure so it becomes part of the same atomic transaction.

### New Transaction Flow
```
BEGIN TRANSACTION (implicit in stored procedure)
  1. UPDATE users SET deletion_requested_at = NOW()
  2. INSERT INTO user_deletion_audit
  3. DELETE FROM all user-related tables
  4. DELETE FROM users
  5. UPDATE user_deletion_audit SET success = true
COMMIT (all succeed) OR ROLLBACK (any fail)
```

### Atomicity Guarantee
- If **any** operation fails → **all** operations roll back (including timestamp)
- If **all** operations succeed → **all** operations commit (including timestamp)
- No more inconsistent states

## Changes Made

### 1. Database Migration (`2025-10-03_0031_atomic_deletion_requested_timestamp.sql`)

**Key Changes:**
- Added `UPDATE users SET deletion_requested_at = NOW()` at the start of the function
- Returns `deletion_requested_at` in response for confirmation
- Enhanced error handling ensures timestamp rolls back on any failure

**New Function Behavior:**
```sql
CREATE OR REPLACE FUNCTION delete_user_data_atomic(
  target_user_id UUID,
  performed_by UUID DEFAULT NULL,
  reason TEXT DEFAULT NULL,
  ip_address INET DEFAULT NULL
)
RETURNS jsonb
AS $$
DECLARE
  v_deletion_requested_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- ATOMICALLY set consent timestamp (rolls back if anything fails)
  UPDATE users 
  SET deletion_requested_at = NOW()
  WHERE id = target_user_id
  RETURNING deletion_requested_at INTO v_deletion_requested_at;
  
  -- ... rest of deletion logic ...
  
  RETURN jsonb_build_object(
    'success', true,
    'deletion_requested_at', v_deletion_requested_at,
    -- ... other fields ...
  );
END;
$$;
```

### 2. Controller Update (`backend/src/controllers/userController.js`)

**Removed:** Lines 418-434 (standalone `deletion_requested_at` update)
```javascript
// REMOVED - No longer needed
const { error: consentError } = await supabase
  .from('users')
  .update({ deletion_requested_at: new Date().toISOString() })
  .eq('id', user_id);
```

**Simplified to:**
```javascript
// Call the atomic deletion stored procedure
// This sets deletion_requested_at AND deletes all user data in a single transaction
// Either ALL operations succeed or ALL roll back (including the timestamp)
const { data: deletionResult, error: rpcError } = await supabase
  .rpc('delete_user_data_atomic', { 
    target_user_id: user_id,
    performed_by: user_id,
    reason: reason || 'User-initiated account deletion',
    ip_address: ip_address || null
  });
```

## Error Handling

### Previous Behavior (❌ Inconsistent)
```javascript
try {
  await updateTimestamp(); // ✓ Commits immediately
  await deleteUserData();   // ✗ Fails
  // Result: Timestamp set but data still exists
} catch (error) {
  // Can't roll back the timestamp!
}
```

### New Behavior (✅ Consistent)
```javascript
try {
  const result = await rpc('delete_user_data_atomic', { ... });
  // Either:
  //   - Timestamp set AND data deleted (both committed)
  //   - Timestamp NOT set AND data NOT deleted (both rolled back)
} catch (error) {
  // Automatic rollback of ALL operations
  return res.status(500).json({ 
    error: 'Failed to delete user account. No data was removed (transaction rolled back).'
  });
}
```

## Response Changes

The RPC now returns `deletion_requested_at` in the success response:

```json
{
  "success": true,
  "user_id": "uuid",
  "audit_id": "uuid",
  "deletion_requested_at": "2025-10-03T12:34:56.789Z",
  "deleted_rows": { ... }
}
```

## Testing Recommendations

1. **Success Case**: Verify deletion completes and timestamp is set
2. **Failure Case**: Simulate RPC error and verify timestamp is NOT set
3. **Idempotency**: Calling with same user twice should fail gracefully
4. **Audit Trail**: Verify audit records include correct `deletion_requested_at`

## Rollback Procedure

If you need to revert this change:

```sql
\i SQL/rollbacks/2025-10-03_0031_atomic_deletion_requested_timestamp.rollback.sql
```

**Note:** After rollback, you must manually update the controller to add back the standalone timestamp update, or deletions will fail due to missing consent timestamp.

## Benefits

1. ✅ **Atomic Consistency**: Timestamp and deletion succeed or fail together
2. ✅ **Simplified Controller**: Removed 16 lines of standalone update logic
3. ✅ **Better Error Handling**: Single point of failure with proper rollback
4. ✅ **Audit Compliance**: Audit trail always reflects accurate consent timestamps
5. ✅ **No Race Conditions**: Timestamp can't be set without deletion proceeding

## Migration Path

### Development/Staging
```bash
# Run migration
psql -d your_database -f SQL/migrations/2025-10-03_0031_atomic_deletion_requested_timestamp.sql

# Deploy updated controller code
# Test thoroughly
```

### Production
1. Apply SQL migration (no data changes, only function update)
2. Deploy updated backend code
3. Monitor logs for any errors
4. Verify audit trail shows correct timestamps

## Related Files

- Migration: `SQL/migrations/2025-10-03_0031_atomic_deletion_requested_timestamp.sql`
- Rollback: `SQL/rollbacks/2025-10-03_0031_atomic_deletion_requested_timestamp.rollback.sql`
- Controller: `backend/src/controllers/userController.js` (lines ~415-430)
- Previous migration: `SQL/migrations/2025-10-03_0030_fix_milestones_deletion.sql`

## Compliance Notes

This change improves Google Developer Policy compliance by:

1. Ensuring user consent (deletion_requested_at) is never recorded unless deletion actually proceeds
2. Preventing "zombie" consent states where users appear to have requested deletion but data remains
3. Maintaining accurate audit trails for data protection regulations (GDPR, CCPA)

