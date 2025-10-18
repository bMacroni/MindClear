#!/usr/bin/env node

/**
 * Simple FCM test to isolate notification delivery issues
 */

import { createClient } from '@supabase/supabase-js';
import admin from 'firebase-admin';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

async function testSimpleFCM() {
  console.log('🧪 Testing Simple FCM Notification...\n');

  try {
    const testEmail = 'bmcornell88@gmail.com';
    
    // Get the user and their FCM token
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('email', testEmail)
      .limit(1);

    if (usersError) {
      console.error('❌ Error fetching user:', usersError);
      return;
    }

    const user = users[0];
    console.log(`👤 User: ${user.full_name} (${user.id})`);

    // Get device tokens
    const { data: deviceTokens, error: tokensError } = await supabase
      .from('user_device_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('device_type', 'android');

    if (tokensError) {
      console.error('❌ Error fetching device tokens:', tokensError);
      return;
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      console.log('❌ No Android device tokens found');
      return;
    }

    const token = deviceTokens[0].device_token;
    console.log(`📱 Using token: ${token.substring(0, 30)}...`);

    // Send a simple test message directly via Firebase Admin
    const message = {
      token: token,
      notification: {
        title: '🧪 Simple FCM Test',
        body: `Test sent at ${new Date().toLocaleTimeString()}`
      },
      data: {
        test: 'true',
        timestamp: Date.now().toString()
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default'
        }
      }
    };

    console.log('📤 Sending simple FCM message...');
    const response = await admin.messaging().send(message);
    console.log('✅ Message sent successfully:', response);

    // Also try sending to all tokens
    if (deviceTokens.length > 1) {
      console.log(`\n📤 Sending to all ${deviceTokens.length} tokens...`);
      const tokens = deviceTokens.map(t => t.device_token);
      const multicastMessage = {
        tokens: tokens,
        notification: {
          title: '🧪 Multicast FCM Test',
          body: `Multicast test sent at ${new Date().toLocaleTimeString()}`
        },
        data: {
          test: 'multicast',
          timestamp: Date.now().toString()
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'default'
          }
        }
      };

      const multicastResponse = await admin.messaging().sendMulticast(multicastMessage);
      console.log('✅ Multicast message sent:', multicastResponse);
    }

  } catch (error) {
    console.error('❌ FCM test failed:', error);
    
    // Check for specific Firebase errors
    if (error.code === 'messaging/registration-token-not-registered') {
      console.log('🔧 Token is not registered. The app may need to be reinstalled or the token refreshed.');
    } else if (error.code === 'messaging/invalid-registration-token') {
      console.log('🔧 Token is invalid. Check if the token is correct.');
    } else if (error.code === 'messaging/mismatched-credential') {
      console.log('🔧 Firebase credentials mismatch. Check google-services.json and Firebase project settings.');
    }
  }
}

// Run the test
testSimpleFCM()
  .then(() => {
    console.log('\n🏁 FCM test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 FCM test crashed:', error);
    process.exit(1);
  });
