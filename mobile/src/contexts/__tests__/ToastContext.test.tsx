import { showToast as serviceShowToast, hideToast as serviceHideToast } from '../ToastContext';

describe('ToastContext Service Bridge', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    // Suppress console.warn for these tests since we're testing behavior without a mounted provider
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('Service bridge functions', () => {
    it('showToast can be called without error before provider mounts', () => {
      // This should not throw - it just logs a warning
      expect(() => {
        serviceShowToast('success', 'Test message');
      }).not.toThrow();
    });

    it('hideToast can be called without error before provider mounts', () => {
      // This should not throw
      expect(() => {
        serviceHideToast();
      }).not.toThrow();
    });

    it('showToast accepts all toast types', () => {
      expect(() => {
        serviceShowToast('success', 'Success message');
        serviceShowToast('error', 'Error message');
        serviceShowToast('info', 'Info message');
        serviceShowToast('warning', 'Warning message');
      }).not.toThrow();
    });

    it('showToast accepts custom duration', () => {
      expect(() => {
        serviceShowToast('info', 'Custom duration', 5000);
      }).not.toThrow();
    });

    it('showToast handles empty messages', () => {
      expect(() => {
        serviceShowToast('info', '');
      }).not.toThrow();
    });

    it('showToast handles very long messages', () => {
      const longMessage = 'A'.repeat(1000);
      expect(() => {
        serviceShowToast('info', longMessage);
      }).not.toThrow();
    });

    it('showToast handles special characters', () => {
      expect(() => {
        serviceShowToast('info', 'Message with "quotes" & <special> chars!');
      }).not.toThrow();
    });

    it('handles multiple rapid calls without crashing', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          serviceShowToast('info', `Message ${i}`);
        }
      }).not.toThrow();
    });

    it('hideToast can be called multiple times', () => {
      expect(() => {
        serviceHideToast();
        serviceHideToast();
        serviceHideToast();
      }).not.toThrow();
    });

    it('handles alternating show/hide calls', () => {
      expect(() => {
        serviceShowToast('success', 'Message 1');
        serviceHideToast();
        serviceShowToast('error', 'Message 2');
        serviceHideToast();
        serviceShowToast('info', 'Message 3');
      }).not.toThrow();
    });
  });

  describe('ToastType validation', () => {
    it('accepts valid toast types', () => {
      const validTypes: Array<'success' | 'error' | 'info' | 'warning'> = ['success', 'error', 'info', 'warning'];
      
      validTypes.forEach(type => {
        expect(() => {
          serviceShowToast(type, `Test ${type} message`);
        }).not.toThrow();
      });
    });
  });

  describe('Duration handling', () => {
    it('handles default duration (undefined)', () => {
      expect(() => {
        serviceShowToast('info', 'Default duration');
      }).not.toThrow();
    });

    it('handles custom durations', () => {
      expect(() => {
        serviceShowToast('info', 'Short duration', 1000);
        serviceShowToast('info', 'Medium duration', 3000);
        serviceShowToast('info', 'Long duration', 10000);
      }).not.toThrow();
    });

    it('handles zero duration', () => {
      expect(() => {
        serviceShowToast('info', 'Zero duration', 0);
      }).not.toThrow();
    });

    it('handles negative duration gracefully', () => {
      expect(() => {
        serviceShowToast('info', 'Negative duration', -1000);
      }).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('handles undefined message gracefully', () => {
      expect(() => {
        // @ts-ignore - Testing runtime behavior
        serviceShowToast('info', undefined);
      }).not.toThrow();
    });

    it('handles null message gracefully', () => {
      expect(() => {
        // @ts-ignore - Testing runtime behavior
        serviceShowToast('info', null);
      }).not.toThrow();
    });

    it('handles numeric message gracefully', () => {
      expect(() => {
        // @ts-ignore - Testing runtime behavior
        serviceShowToast('info', 12345);
      }).not.toThrow();
    });

    it('handles object message gracefully', () => {
      expect(() => {
        // @ts-ignore - Testing runtime behavior
        serviceShowToast('info', { key: 'value' });
      }).not.toThrow();
    });
  });

  describe('Concurrent operations', () => {
    it('handles rapid successive calls without queue overflow', () => {
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          if (i % 2 === 0) {
            serviceShowToast('success', `Message ${i}`);
          } else {
            serviceHideToast();
          }
        }
      }).not.toThrow();
    });

    it('handles interleaved show and hide calls', () => {
      expect(() => {
        serviceShowToast('info', 'First');
        serviceShowToast('error', 'Second');
        serviceHideToast();
        serviceShowToast('success', 'Third');
        serviceHideToast();
        serviceHideToast();
        serviceShowToast('warning', 'Fourth');
      }).not.toThrow();
    });
  });
});
