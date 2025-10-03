/**
 * Retry Service - Provides bounded retry logic with exponential backoff
 * for transient errors and failure queue management
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Determines if an error is transient and should be retried
 * @param {Error} error - The error to check
 * @returns {boolean} - True if the error is retryable
 */
function isTransientError(error) {
  if (!error) return false;
  
  // HTTP status codes that indicate transient failures
  const transientStatusCodes = [408, 429, 500, 502, 503, 504];
  
  // Check for HTTP status
  if (error.status && transientStatusCodes.includes(error.status)) {
    return true;
  }
  
  // Check for common transient error messages
  const transientPatterns = [
    /timeout/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /network/i,
    /temporarily unavailable/i,
    /too many requests/i,
    /rate limit/i,
    /service unavailable/i,
    /gateway timeout/i,
    /bad gateway/i
  ];
  
  const errorMessage = error.message || error.toString();
  return transientPatterns.some(pattern => pattern.test(errorMessage));
}

/**
 * Executes an async function with exponential backoff retry logic
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry configuration
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.baseDelayMs - Base delay in milliseconds (default: 1000)
 * @param {number} options.maxDelayMs - Maximum delay in milliseconds (default: 10000)
 * @param {Function} options.isRetryable - Custom function to determine if error is retryable
 * @returns {Promise<Object>} - Result with success boolean, data, error, and attempts count
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    isRetryable = isTransientError
  } = options;
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        data: result,
        error: null,
        attempts: attempt
      };
    } catch (error) {
      lastError = error;
      
      // If this was the last attempt or error is not retryable, stop
      if (attempt > maxRetries || !isRetryable(error)) {
        console.error(`Operation failed after ${attempt} attempt(s):`, {
          error: error?.message || String(error),
          retryable: isRetryable(error),
          attempts: attempt
        });
        return {
          success: false,
          data: null,
          error: error,
          attempts: attempt
        };
      }
      
      // Calculate exponential backoff delay with jitter
      const exponentialDelay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs
      );
      const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
      const delay = Math.floor(exponentialDelay + jitter);
      
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, {
        error: error?.message || String(error),
        nextAttempt: attempt + 1,
        maxRetries: maxRetries + 1
      });
      
      // Wait before next retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should not be reached but handle it anyway
  return {
    success: false,
    data: null,
    error: lastError,
    attempts: maxRetries + 1
  };
}

/**
 * Enqueues a failed operation for async/manual cleanup
 * @param {Object} params - Queue parameters
 * @param {string} params.user_id - The user ID
 * @param {string} params.operation_type - Type of operation (e.g., 'auth_deletion')
 * @param {Object} params.context - Additional context (deletionResult, error details, etc.)
 * @param {number} params.retry_count - Number of retries attempted
 * @param {Object} params.last_error - The final error that occurred
 * @returns {Promise<Object>} - Result with queue entry ID
 */
export async function enqueueFailedOperation(params) {
  const { user_id, operation_type, context, retry_count, last_error } = params;
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  try {
    const { data, error } = await supabase
      .from('auth_deletion_queue')
      .insert({
        user_id,
        operation_type,
        context: {
          ...context,
          error_message: last_error?.message || String(last_error),
          error_status: last_error?.status,
          retry_count,
          enqueued_at: new Date().toISOString()
        },
        status: 'pending',
        retry_count,
        last_error: last_error?.message || String(last_error),
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Failed to enqueue failed operation:', error);
      return { success: false, error };
    }
    
    console.log(`Operation enqueued for manual cleanup:`, {
      queue_id: data.id,
      user_id,
      operation_type
    });
    
    return { success: true, data };
  } catch (error) {
    console.error('Exception in enqueueFailedOperation:', error);
    return { success: false, error };
  }
}

/**
 * Marks a user as having a failed deletion (compensating action)
 * This allows the system to track users whose DB records were deleted but auth wasn't
 * @param {string} user_id - The user ID
 * @param {Object} context - Additional context
 * @returns {Promise<Object>} - Result of the operation
 */
export async function markUserDeletionFailed(user_id, context = {}) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  try {
    // Check if user still exists in DB (in case they were fully deleted)
    const { data: userData, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user_id)
      .single();
    
    if (checkError || !userData) {
      console.log('User record not found in DB, cannot mark as failed deletion:', {
        user_id,
        error: checkError?.message
      });
      return { 
        success: false, 
        error: 'User record not found',
        userDeleted: true 
      };
    }
    
    // Update user record to indicate failed deletion
    const { data, error } = await supabase
      .from('users')
      .update({
        deletion_status: 'auth_deletion_failed',
        deletion_failed_at: new Date().toISOString(),
        deletion_failure_context: {
          ...context,
          timestamp: new Date().toISOString()
        }
      })
      .eq('id', user_id)
      .select()
      .single();
    
    if (error) {
      console.error('Failed to mark user deletion as failed:', error);
      return { success: false, error };
    }
    
    console.log(`User marked with failed auth deletion:`, { user_id });
    return { success: true, data };
  } catch (error) {
    console.error('Exception in markUserDeletionFailed:', error);
    return { success: false, error };
  }
}

/**
 * Sends an ops alert for failed auth deletion
 * In a production system, this would integrate with monitoring/alerting systems
 * @param {Object} alertData - Alert data
 */
export async function sendOpsAlert(alertData) {
  const {
    user_id,
    operation_type,
    error_message,
    retry_count,
    context,
    queue_id
  } = alertData;
  
  // Log critical alert (would integrate with PagerDuty, Opsgenie, etc. in production)
  console.error('🚨 OPS ALERT - AUTH DELETION FAILURE 🚨', {
    severity: 'critical',
    user_id,
    operation_type,
    error_message,
    retry_count,
    queue_id,
    context,
    timestamp: new Date().toISOString(),
    action_required: 'Manual intervention required to complete auth account deletion',
    remediation_steps: [
      '1. Check Supabase auth dashboard for orphaned account',
      '2. Manually delete auth account if present',
      '3. Update auth_deletion_queue status to "completed"',
      '4. Verify no data remains in database'
    ]
  });
  
  // In production, you might also:
  // - Send to monitoring service (Datadog, New Relic, etc.)
  // - Create incident in incident management system
  // - Send notification to ops team via Slack/PagerDuty
  // - Update metrics/dashboards
}

