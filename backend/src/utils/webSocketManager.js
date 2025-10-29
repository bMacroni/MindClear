import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import logger from './logger.js';

class WebSocketManager {
  constructor() {
    this.clients = new Map();
    this.wss = null;
    // Initialize Supabase client for JWT verification (supports new signing keys via JWKS)
    this.supabase = null;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    }
  }

  init(server) {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws, req) => {
      // The initial connection is unauthenticated.
      // The client must send an auth token as its first message.
      logger.info('WebSocket client connected');

      let isAuthenticated = false;
      const authTimeout = setTimeout(() => {
        ws.terminate();
        logger.warn('WebSocket client terminated due to auth timeout');
      }, 10000); // 10 seconds to authenticate

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          
          // Enforce that first message must be auth message
          if (!isAuthenticated && data.type !== 'auth') {
            logger.warn('WebSocket client sent non-auth message before authentication');
            try {
              ws.send(JSON.stringify({ 
                type: 'auth_error', 
                message: 'First message must be authentication' 
              }));
            } catch (sendError) {
              logger.error('Failed to send auth error message:', sendError);
            }
            ws.close(1008, 'Authentication required');
            return;
          }
          
          if (data.type === 'auth' && data.token) {
            clearTimeout(authTimeout);
            
            // Use Supabase SDK for JWT verification (automatically handles new signing keys via JWKS)
            if (!this.supabase) {
              logger.error('WebSocket authentication failed: Supabase client not initialized');
              try {
                ws.send(JSON.stringify({ 
                  type: 'auth_error', 
                  message: 'Authentication service unavailable'
                }));
              } catch (sendError) {
                logger.error('Failed to send auth error message:', sendError);
              }
              ws.close(1008, 'Authentication service unavailable');
              return;
            }

            // Verify token using Supabase SDK (supports both legacy HS256 and new ECC signing keys)
            this.supabase.auth.getUser(data.token)
              .then(({ data: userData, error }) => {
                if (error || !userData?.user) {
                  logger.warn('WebSocket authentication failed:', error?.message || 'No user data');
                  
                  // Send error message to client before terminating
                  try {
                    ws.send(JSON.stringify({ 
                      type: 'auth_error', 
                      message: 'Authentication failed', 
                      error: error?.message || 'Invalid token'
                    }));
                  } catch (sendError) {
                    logger.error('Failed to send auth error message:', sendError);
                  }
                  
                  // Close with specific code to indicate auth failure
                  ws.close(1008, 'Authentication failed');
                } else {
                  const userId = userData.user.id;
                  this.clients.set(userId, ws);
                  isAuthenticated = true;
                  logger.info(`WebSocket client authenticated for user: ${userId}`);

                  ws.on('close', () => {
                    this.clients.delete(userId);
                    logger.info(`WebSocket client disconnected for user: ${userId}`);
                  });

                  ws.send(JSON.stringify({ type: 'auth_success', message: 'Authentication successful' }));
                }
              })
              .catch((err) => {
                logger.error('WebSocket authentication error:', err);
                try {
                  ws.send(JSON.stringify({ 
                    type: 'auth_error', 
                    message: 'Authentication service error'
                  }));
                } catch (sendError) {
                  logger.error('Failed to send auth error message:', sendError);
                }
                ws.close(1008, 'Authentication service error');
              });
          }
        } catch (e) {
          logger.error('Error processing WebSocket message:', e);
          // For non-JSON or other pre-auth errors, close with 1008
          if (!isAuthenticated) {
            try {
              ws.send(JSON.stringify({ 
                type: 'auth_error', 
                message: 'Invalid message format' 
              }));
            } catch (sendError) {
              logger.error('Failed to send auth error message:', sendError);
            }
            ws.close(1008, 'Invalid message format');
          }
        }
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });
    });

    logger.info('WebSocket server initialized');
  }

  sendMessage(userId, message) {
    const client = this.clients.get(userId);
    if (client && client.readyState === client.OPEN) {
      client.send(JSON.stringify(message));
      return true;
    }
    return false;
  }
}

export default new WebSocketManager();
