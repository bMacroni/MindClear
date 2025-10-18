import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ProfileScreen from '../screens/profile/ProfileScreen';
import { usersAPI } from '../services/api';
import { notificationService } from '../services/notificationService';

// Mock the navigation
const mockNavigation = {
  navigate: jest.fn(),
  reset: jest.fn(),
};

// Mock the usersAPI
jest.mock('../services/api', () => ({
  usersAPI: {
    getMe: jest.fn(),
    updateMe: jest.fn(),
    updateNotificationPreference: jest.fn(),
  },
}));

// Mock the notification service
jest.mock('../services/notificationService', () => ({
  notificationService: {
    checkNotificationPermission: jest.fn(),
    requestUserPermission: jest.fn(),
  },
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('ProfileScreen - Focus Notification Features', () => {
  const mockProfile = {
    id: 'test-user-123',
    email: 'test@example.com',
    full_name: 'John Doe',
    timezone: 'America/Chicago',
    notification_preferences: {
      channels: { in_app: true, email: true },
      categories: { tasks: true, goals: true, scheduling: true },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (usersAPI.getMe as jest.Mock).mockResolvedValue(mockProfile);
    (notificationService.checkNotificationPermission as jest.Mock).mockResolvedValue(true);
  });

  describe('Timezone Picker', () => {
    it('should display current timezone in picker', async () => {
      const { getByDisplayValue } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByDisplayValue('America/Chicago (Central)')).toBeTruthy();
      });
    });

    it('should update timezone when picker value changes', async () => {
      const { getByDisplayValue } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        const picker = getByDisplayValue('America/Chicago (Central)');
        fireEvent(picker, 'onValueChange', 'America/New_York');
      });

      // The picker should update its selected value
      await waitFor(() => {
        expect(getByDisplayValue('America/New_York (Eastern)')).toBeTruthy();
      });
    });

    it('should save timezone when save profile is pressed', async () => {
      (usersAPI.updateMe as jest.Mock).mockResolvedValue({
        ...mockProfile,
        timezone: 'America/New_York',
      });

      const { getByDisplayValue, getByText } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        const picker = getByDisplayValue('America/Chicago (Central)');
        fireEvent(picker, 'onValueChange', 'America/New_York');
      });

      const saveButton = getByText('Save Changes');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(usersAPI.updateMe).toHaveBeenCalledWith({
          full_name: 'John Doe',
          geographic_location: '',
          timezone: 'America/New_York',
        });
      });
    });

    it('should handle timezone save errors gracefully', async () => {
      (usersAPI.updateMe as jest.Mock).mockRejectedValue(new Error('Save failed'));

      const { getByDisplayValue, getByText } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        const picker = getByDisplayValue('America/Chicago (Central)');
        fireEvent(picker, 'onValueChange', 'America/New_York');
      });

      const saveButton = getByText('Save Changes');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(usersAPI.updateMe).toHaveBeenCalled();
      });
    });

    it('should show all available timezone options', async () => {
      const { getByDisplayValue } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        const picker = getByDisplayValue('America/Chicago (Central)');
        
        // Check that picker has multiple options
        expect(picker.props.children).toBeDefined();
      });
    });
  });

  describe('Tasks Toggle - Focus Notification Control', () => {
    it('should update focus reminder preference when Tasks toggle is changed', async () => {
      (usersAPI.updateNotificationPreference as jest.Mock).mockResolvedValue({});

      const { getByTestId } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        // Find the Tasks toggle switch
        const tasksToggle = getByTestId('tasks-notification-toggle');
        fireEvent(tasksToggle, 'onValueChange', false);
      });

      await waitFor(() => {
        expect(usersAPI.updateNotificationPreference).toHaveBeenCalledWith(
          'daily_focus_reminder',
          'push',
          false
        );
      });
    });

    it('should enable focus reminder when Tasks toggle is turned on', async () => {
      (usersAPI.updateNotificationPreference as jest.Mock).mockResolvedValue({});

      const { getByTestId } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        const tasksToggle = getByTestId('tasks-notification-toggle');
        fireEvent(tasksToggle, 'onValueChange', true);
      });

      await waitFor(() => {
        expect(usersAPI.updateNotificationPreference).toHaveBeenCalledWith(
          'daily_focus_reminder',
          'push',
          true
        );
      });
    });

    it('should handle notification preference update errors', async () => {
      (usersAPI.updateNotificationPreference as jest.Mock).mockRejectedValue(
        new Error('Update failed')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { getByTestId } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        const tasksToggle = getByTestId('tasks-notification-toggle');
        fireEvent(tasksToggle, 'onValueChange', false);
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to update focus reminder preference:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });

    it('should maintain existing Tasks toggle behavior', async () => {
      const { getByTestId } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        const tasksToggle = getByTestId('tasks-notification-toggle');
        expect(tasksToggle.props.value).toBe(true); // Should be enabled by default
      });
    });
  });

  describe('Integration Tests', () => {
    it('should load profile with timezone and notification preferences', async () => {
      const { getByDisplayValue, getByTestId } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByDisplayValue('America/Chicago (Central)')).toBeTruthy();
        expect(getByTestId('tasks-notification-toggle')).toBeTruthy();
      });
    });

    it('should handle profile loading errors gracefully', async () => {
      (usersAPI.getMe as jest.Mock).mockRejectedValue(new Error('Load failed'));

      const { getByText } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Unable to load profile')).toBeTruthy();
      });
    });

    it('should show loading state initially', () => {
      (usersAPI.getMe as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const { getByTestId } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      // Should show loading skeleton
      expect(getByTestId('loading-skeleton')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility labels for timezone picker', async () => {
      const { getByDisplayValue } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        const picker = getByDisplayValue('America/Chicago (Central)');
        expect(picker.props.accessibilityLabel).toBeDefined();
      });
    });

    it('should have proper accessibility labels for Tasks toggle', async () => {
      const { getByTestId } = render(
        <ProfileScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        const toggle = getByTestId('tasks-notification-toggle');
        expect(toggle.props.accessibilityLabel).toBeDefined();
      });
    });
  });
});
