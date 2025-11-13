import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  toast: ToastState;
  showToast: (type: ToastType, message: string, duration?: number) => boolean;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Service bridge: allows services to trigger toasts without React hooks
// This uses a ref pattern to access the context functions from outside React components
let toastServiceRef: {
  showToast: (type: ToastType, message: string, duration?: number) => boolean;
  hideToast: () => void;
} | null = null;

/**
 * ToastProvider manages global toast notification state.
 * Provides toast functionality to both React components and services.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'info',
    duration: 4000,
  });

  const showToast = useCallback((type: ToastType, message: string, duration: number = 4000): boolean => {
    setToast({
      visible: true,
      message,
      type,
      duration,
    });
    return true;
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({
      ...prev,
      visible: false,
    }));
  }, []);

  // Update service bridge ref whenever functions change
  React.useEffect(() => {
    toastServiceRef = {
      showToast,
      hideToast,
    };
  }, [showToast, hideToast]);

  const value: ToastContextValue = {
    toast,
    showToast,
    hideToast,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
};

/**
 * Hook to access toast functionality from React components.
 * @throws Error if used outside ToastProvider
 */
export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

/**
 * Service bridge function: allows services to show toasts without React hooks.
 * This function can be imported and called from any service file.
 * 
 * @param type - The type of toast ('success' | 'error' | 'info' | 'warning')
 * @param message - The message to display
 * @param duration - Optional duration in milliseconds (default: 4000)
 * @returns true if the toast was successfully shown, false if the provider is not mounted
 * 
 * @example
 * ```typescript
 * import { showToast } from '../contexts/ToastContext';
 * const success = showToast('error', 'Sync failed. Please try again.');
 * if (!success) {
 *   // Handle case where toast provider is not available
 * }
 * ```
 */
export const showToast = (type: ToastType, message: string, duration?: number): boolean => {
  if (toastServiceRef) {
    const result = toastServiceRef.showToast(type, message, duration);
    return Boolean(result);
  } else {
    // Fallback: log to console if context not initialized
    console.warn('Toast context not initialized. Message:', message);
    return false;
  }
};

/**
 * Service bridge function: allows services to hide toasts.
 */
export const hideToast = (): void => {
  if (toastServiceRef) {
    toastServiceRef.hideToast();
  }
};


