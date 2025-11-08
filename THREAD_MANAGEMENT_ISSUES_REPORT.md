# Thread Management Issues Report
## AIChatScreen.tsx - Conversation Thread Context Confusion

**Date:** 2025-01-08  
**Issue:** User requested "create task to mow the lawn today" but AI created task for "buy groceries" instead  
**Severity:** CRITICAL - Causes wrong conversation context to be used

---

## Executive Summary

The AIChatScreen component has multiple race conditions and thread management issues that can cause messages to be sent with the wrong thread context. When a user switches between conversations or sends messages quickly, the system may send messages to the wrong thread, causing the AI to use incorrect conversation history.

---

## Critical Issues Identified

### 1. **Race Condition: Thread Switching During Send** ⚠️ CRITICAL

**Location:** `handleSend` function (lines 1084-1325)

**Problem:**
- `threadIdToUse` is captured at the START of `handleSend` (line 1098)
- `currentConversationId` can change during the async API call
- No mechanism prevents thread switching while a message is being sent
- If user switches threads between pressing send and API response, wrong context is used

**Code Location:**
```typescript
// Line 1097-1100: Thread ID captured once, never re-validated
const currentThreadModel = threads.find(t => t.id === currentConversationId);
const isThreadSynced = currentThreadModel?.status === 'synced';
const threadIdToUse = isThreadSynced ? currentConversationId : null;
```

**Impact:** HIGH - Messages can be sent to completely wrong threads

**Fix Required:**
- Lock thread switching during send operation
- Re-validate `currentConversationId` before making API call
- Add thread context validation

---

### 2. **Overly Restrictive Thread Status Check** ⚠️ HIGH

**Location:** Line 1099

**Problem:**
- Only sends `threadId` if thread status is exactly `'synced'`
- If thread exists but hasn't synced yet (e.g., just created, pending sync), `threadIdToUse` becomes `null`
- This causes new threads to be created instead of using existing ones
- Messages end up in wrong/new threads

**Code:**
```typescript
const isThreadSynced = currentThreadModel?.status === 'synced';
const threadIdToUse = isThreadSynced ? currentConversationId : null;
```

**Impact:** HIGH - Creates duplicate threads, loses conversation context

**Fix Required:**
- Use thread if it exists and has an ID, regardless of sync status
- Only create new thread if `currentConversationId` is empty or invalid

---

### 3. **No Thread Context Validation** ⚠️ HIGH

**Location:** Throughout `handleSend` function

**Problem:**
- No validation that `threadIdToUse` matches what user is currently viewing
- No check that `currentConversationId` hasn't changed between capture and API call
- Thread ID is captured once and never re-checked

**Impact:** HIGH - Messages sent to wrong threads without detection

**Fix Required:**
- Add validation before API call: verify `currentConversationId` hasn't changed
- Log threadId being sent vs currentConversationId for debugging
- Add error handling if thread context mismatch detected

---

### 4. **Thread Migration Race Condition** ⚠️ MEDIUM

**Location:** `migrateTempMessagesToServerThread` (lines 1209-1219)

**Problem:**
- Uses `tempThreadId` captured at send time
- But `currentConversationId` might have changed by the time response arrives
- Messages might be migrated to wrong thread if user switched conversations

**Code:**
```typescript
migrateTempMessagesToServerThread(
  tempThreadId,  // Captured at send time
  serverThreadId,
  // ... but currentConversationId might have changed
);
```

**Impact:** MEDIUM - Messages appear in wrong conversation UI

**Fix Required:**
- Verify `currentConversationId` matches `tempThreadId` before migration
- Handle case where thread was switched during send

---

### 5. **Message State Management Issues** ⚠️ MEDIUM

**Location:** `messagesByThread` state management (lines 212-336)

**Problem:**
- Messages are loaded asynchronously when switching threads
- If user sends message before messages finish loading, wrong context might be used
- Complex deduplication logic might merge messages from different threads

**Impact:** MEDIUM - Messages might not appear in correct thread

**Fix Required:**
- Ensure thread messages are loaded before allowing sends
- Improve message deduplication to include threadId in key

---

### 6. **Temporary Thread ID Confusion** ⚠️ MEDIUM

**Location:** Lines 1102-1108

**Problem:**
- Uses `temp-thread-${Date.now()}` for new conversations
- Sets `currentConversationId` to temp ID immediately
- If multiple messages sent quickly, might create multiple temp threads
- Temp thread ID might not match server thread ID

**Code:**
```typescript
const tempThreadId = threadIdToUse || `temp-thread-${Date.now()}`;
if (!threadIdToUse) {
  setCurrentConversationId(tempThreadId);  // Sets immediately
}
```

**Impact:** MEDIUM - Temporary threads might not map correctly to server threads

**Fix Required:**
- Better handling of temp thread IDs
- Ensure temp thread is properly migrated when server responds

---

## Recommended Fixes (Priority Order)

### Priority 1: CRITICAL - Fix Thread Context Validation

```typescript
const handleSend = useCallback(async (messageOverride?: string) => {
  // ... existing code ...
  
  // CAPTURE and LOCK current thread at start
  const lockedThreadId = currentConversationId;
  const lockedThreadModel = threads.find(t => t.id === lockedThreadId);
  
  // Validate thread exists and is valid
  if (lockedThreadId && !lockedThreadId.startsWith('temp-thread-')) {
    // Use thread if it exists, regardless of sync status
    const threadIdToUse = lockedThreadId;
    
    // RE-VALIDATE before API call
    if (currentConversationId !== lockedThreadId) {
      logger.warn('Thread switched during send, aborting');
      setError('Please wait for current message to send before switching conversations.');
      return;
    }
    
    // Make API call with validated threadId
    const response = await conversationService.sendMessage(userMessage, threadIdToUse);
    
    // RE-VALIDATE after API call
    if (currentConversationId !== lockedThreadId) {
      logger.warn('Thread switched during API call');
      // Handle gracefully - message was sent to old thread
    }
  }
  
  // ... rest of code ...
}, [/* dependencies */]);
```

### Priority 2: HIGH - Fix Thread Status Check

```typescript
// Instead of requiring 'synced' status, use thread if it exists
const threadIdToUse = (lockedThreadId && !lockedThreadId.startsWith('temp-thread-'))
  ? lockedThreadId
  : null;
```

### Priority 3: MEDIUM - Add Thread Lock Mechanism

```typescript
const [isSendingToThread, setIsSendingToThread] = useState<string | null>(null);

// In handleSend:
if (isSendingToThread && isSendingToThread !== currentConversationId) {
  setError('Please wait for current message to send before switching conversations.');
  return;
}

setIsSendingToThread(currentConversationId);
try {
  // ... send message ...
} finally {
  setIsSendingToThread(null);
}
```

### Priority 4: MEDIUM - Improve Logging

```typescript
logger.info('Sending message', {
  userMessage: userMessage.substring(0, 50),
  threadIdBeingSent: threadIdToUse,
  currentConversationId: currentConversationId,
  threadStatus: currentThreadModel?.status,
  threadTitle: currentThreadModel?.title,
});
```

---

## Testing Scenarios to Verify Fixes

1. **Rapid Thread Switching + Send:**
   - Switch to Thread A
   - Immediately switch to Thread B
   - Immediately send message
   - Verify message goes to Thread B, not Thread A

2. **Send During Thread Load:**
   - Switch to new thread
   - Send message before messages finish loading
   - Verify correct thread context is used

3. **Multiple Quick Sends:**
   - Send message 1
   - Immediately send message 2
   - Verify both go to same thread

4. **Thread Status Edge Cases:**
   - Create new thread (status: 'pending_create')
   - Send message immediately
   - Verify message uses correct thread, not creates new one

---

## Additional Recommendations

1. **Add Thread Context to API Calls:**
   - Include `currentConversationId` in API request for validation
   - Backend can verify thread matches user's current view

2. **Improve Error Messages:**
   - If thread mismatch detected, show clear error to user
   - Suggest waiting before switching threads

3. **Add Thread Loading State:**
   - Show loading indicator when switching threads
   - Disable send button until thread is fully loaded

4. **Add Analytics:**
   - Track thread context mismatches
   - Monitor how often this issue occurs

---

## Conclusion

The root cause of the "mow lawn" → "buy groceries" issue is a race condition where:
1. User switches threads or sends messages quickly
2. `threadIdToUse` is captured at start but never re-validated
3. Thread context changes during async operation
4. Message is sent to wrong thread
5. Backend uses wrong conversation history

**Immediate Action Required:** Implement Priority 1 and Priority 2 fixes to prevent wrong thread context from being used.

