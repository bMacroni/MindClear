import dotenv from 'dotenv';

const env = process.env.NODE_ENV || 'development';
// Load base, then local, then env-specific, then env-specific local (highest precedence)
dotenv.config();
dotenv.config({ path: `.env.local`, override: true });
dotenv.config({ path: `.env.${env}`, override: true });
dotenv.config({ path: `.env.${env}.local`, override: true });

import logger from '../src/utils/logger.js';

import express from 'express'
import http from 'http'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../src/middleware/auth.js'
import { 
  helmetConfig, 
  globalRateLimit, 
  authRateLimit, 
  errorTracking 
} from '../src/middleware/security.js'
import { initializeFirebaseAdmin } from '../src/utils/firebaseAdmin.js'
import { initializeWebSocketServer } from '../src/utils/websocketServer.js'

// Import route modules
import calendarRouter from '../src/routes/calendar.js'
import aiRouter from '../src/routes/ai.js'
import conversationsRouter from '../src/routes/conversations.js'
import analyticsRouter from '../src/routes/analytics.js'
import assistantChatRouter from '../src/routes/assistantChat.js'

const app = express()
const server = http.createServer(app)


// Initialize Firebase Admin SDK
initializeFirebaseAdmin()
// Initialize WebSocket server
initializeWebSocketServer(server)

// Trust proxy configuration
const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1'
if (trustProxy) {
  app.set('trust proxy', true)
  logger.info('Trust proxy enabled')
} else {
  logger.warn('TRUST_PROXY not configured. Not trusting any proxies.')
}
app.use(helmetConfig)
app.use(globalRateLimit)

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Mood', 'X-User-Timezone']
}
app.use(cors(corsOptions))

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// Register routes
logger.info('Registering calendar router...')
app.use('/api/calendar', calendarRouter)
logger.info('Calendar router registered')

logger.info('Registering AI router...')
app.use('/api/ai', aiRouter)
logger.info('AI router registered')

logger.info('Registering conversations router...')
app.use('/api/conversations', conversationsRouter)
logger.info('Conversations router registered')

logger.info('Registering analytics router...')
app.use('/api/analytics', analyticsRouter)
logger.info('Analytics router registered')

logger.info('Registering assistant chat router...')
app.use('/api/chat', assistantChatRouter)
logger.info('Assistant chat router registered')

// Error handling middleware
app.use(errorTracking)

export default app
