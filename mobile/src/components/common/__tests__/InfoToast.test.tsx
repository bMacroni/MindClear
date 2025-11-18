import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { InfoToast } from '../InfoToast';
import { jest } from '@jest/globals';

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock Animated
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

describe('InfoToast', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders when visible is true', () => {
    const { getByText } = render(
      <InfoToast
        visible={true}
        message="Test info message"
        onClose={mockOnClose}
        duration={4000}
      />
    );

    expect(getByText('Test info message')).toBeTruthy();
  });

  it('does not render when visible is false', () => {
    const { queryByText } = render(
      <InfoToast
        visible={false}
        message="Test info message"
        onClose={mockOnClose}
        duration={4000}
      />
    );

    expect(queryByText('Test info message')).toBeNull();
  });

  it('calls onClose when close button is pressed', () => {
    const { getByLabelText } = render(
      <InfoToast
        visible={true}
        message="Test info message"
        onClose={mockOnClose}
        duration={4000}
      />
    );

    const closeButton = getByLabelText('Close info message');
    fireEvent.press(closeButton);

    // Wait for animation to complete
    jest.advanceTimersByTime(300);
    
    waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('auto-closes after duration', () => {
    render(
      <InfoToast
        visible={true}
        message="Test info message"
        onClose={mockOnClose}
        duration={1000}
      />
    );

    // Advance timers past the duration
    jest.advanceTimersByTime(1000);
    jest.advanceTimersByTime(300); // Animation duration

    waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('renders action button when actionLabel and onActionPress are provided', () => {
    const mockOnActionPress = jest.fn();
    const { getByText } = render(
      <InfoToast
        visible={true}
        message="Test info message"
        onClose={mockOnClose}
        duration={4000}
        actionLabel="Action"
        onActionPress={mockOnActionPress}
      />
    );

    expect(getByText('Action')).toBeTruthy();
  });

  it('calls onActionPress when action button is pressed', () => {
    const mockOnActionPress = jest.fn();
    const { getByText } = render(
      <InfoToast
        visible={true}
        message="Test info message"
        onClose={mockOnClose}
        duration={4000}
        actionLabel="Action"
        onActionPress={mockOnActionPress}
      />
    );

    const actionButton = getByText('Action');
    fireEvent.press(actionButton);

    expect(mockOnActionPress).toHaveBeenCalled();
  });

  it('uses default duration of 4000ms when not provided', () => {
    render(
      <InfoToast
        visible={true}
        message="Test info message"
        onClose={mockOnClose}
      />
    );

    // Advance timers past default duration
    jest.advanceTimersByTime(4000);
    jest.advanceTimersByTime(300); // Animation duration

    waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('has proper accessibility labels', () => {
    const { getByLabelText } = render(
      <InfoToast
        visible={true}
        message="Test info message"
        onClose={mockOnClose}
        duration={4000}
      />
    );

    expect(getByLabelText('Info: Test info message')).toBeTruthy();
    expect(getByLabelText('Close info message')).toBeTruthy();
  });
});


