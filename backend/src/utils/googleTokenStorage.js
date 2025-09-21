import { encryptGoogleTokens, decryptGoogleTokens } from './tokenEncryption.js';
import logger from './logger.js';

export async function storeGoogleTokens(userId, tokens) {
  try {
    // Storing tokens for user
    
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Encrypt sensitive tokens before storage
    const encryptedTokens = encryptGoogleTokens(tokens);
    
    const tokenData = {
      user_id: userId,
      access_token: encryptedTokens.access_token,
      refresh_token: encryptedTokens.refresh_token,
      token_type: tokens.token_type,
      scope: tokens.scope,
      expiry_date: tokens.expiry_date,
      updated_at: new Date().toISOString()
    };
    
    // Token data to store
    
    const { data, error } = await supabase
      .from('google_tokens')
      .upsert(tokenData, {
        onConflict: 'user_id'
      });
      
    if (error) {
      logger.error('[TokenStorage] Error storing Google tokens:', error);
      throw error;
    }
    
    logger.info('[TokenStorage] Successfully stored encrypted Google tokens', {
      userId,
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token
    });
    
    // Successfully stored tokens for user
    return data;
  } catch (error) {
    logger.error('[TokenStorage] Failed to store Google tokens:', error);
    throw error;
  }
}

export async function getGoogleTokens(userId) {
  try {
    // Retrieving tokens for user
    
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data, error } = await supabase
      .from('google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') {
        // No tokens found for user
        return null;
      }
      logger.error(`[TokenStorage] Error retrieving tokens for user ${userId}:`, error);
      throw error;
    }
    
    // Decrypt tokens before returning
    const decryptedData = decryptGoogleTokens(data);
    
    logger.info('[TokenStorage] Successfully retrieved and decrypted Google tokens', {
      userId,
      hasAccessToken: !!decryptedData.access_token,
      hasRefreshToken: !!decryptedData.refresh_token
    });
    
    return decryptedData;
  } catch (error) {
    logger.error('[TokenStorage] Failed to get Google tokens:', error);
    throw error;
  }
}

export async function deleteGoogleTokens(userId) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { error } = await supabase
      .from('google_tokens')
      .delete()
      .eq('user_id', userId);
    if (error) {
      throw error;
    }
    
    logger.info('[TokenStorage] Successfully deleted Google tokens', { userId });
    return true;
  } catch (error) {
    logger.error('Failed to delete Google tokens:', error);
    throw error;
  }
} 