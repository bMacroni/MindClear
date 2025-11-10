import { useState, useEffect } from 'react';
import { AuthState, authService } from './src/services/auth';
import { GoogleAuthService } from './src/services/googleAuth';
import { secureConfigService } from './src/services/secureConfig';
import { configService } from './src/services/config';
import { logger } from './src/utils/logger';

const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [authState, setAuthState] = useState<AuthState>(authService.getAuthState());

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = authService.subscribe(setAuthState);
    return () => unsubscribe();
  }, []);

  // Initialize Google Sign-In only when authenticated and config is ready
  useEffect(() => {
    const initializeGoogleSignIn = async () => {
      if (authState.isAuthenticated) {
        try {
          // Wait for secure config to be ready
          await secureConfigService.onReady();
          
          const webClientId = secureConfigService.getGoogleWebClientId() || configService.getGoogleWebClientId();
          
          if (webClientId) {
            await GoogleAuthService.getInstance().configureGoogleSignIn(webClientId);
          } else {
            console.warn('Skipping Google Sign-In configuration - web client ID not available yet. Will retry when remote config loads.');
          }
        } catch (error) {
          logger.error('Failed to initialize Google Sign-In', error);
        }
      }
    };

    initializeGoogleSignIn();
  }, [authState.isAuthenticated]); // Re-run when authentication state changes

  useEffect(() => {
    const loadApp = async () => {
      // ... existing code ...
    };
    loadApp();
  }, []);

  if (!isReady) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {/* Your app content goes here */}
      <h1>Welcome to My App</h1>
      <p>This component is ready to use.</p>
    </div>
  );
};

export default App;
