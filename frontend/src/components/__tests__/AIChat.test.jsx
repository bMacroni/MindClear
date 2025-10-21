import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AIChat from '../AIChat';
import { aiAPI, calendarAPI } from '../../services/api';

// Mock the api services
vi.mock('../../services/api', () => ({
  aiAPI: {
    sendMessage: vi.fn(),
    setMood: vi.fn(),
  },
  calendarAPI: {
    getEvents: vi.fn(),
  },
  goalsAPI: {
    getAll: vi.fn().mockResolvedValue({ data: [] }),
  },
  tasksAPI: {
    getAll: vi.fn().mockResolvedValue({ data: [] }),
  },
  conversationsAPI: {
    getThreads: vi.fn().mockResolvedValue({ data: [] }),
    getMessages: vi.fn().mockResolvedValue({ data: [] }),
    createThread: vi.fn().mockResolvedValue({ data: { id: 'thread-123' } }),
  },
}));

describe('AIChat Component', () => {
  it('should render calendar events when the AI returns a read_calendar_event action', async () => {
    // Mock the AI response
    const aiResponse = {
      data: {
        message: "I've processed your request and created 1 action:",
        actions: [{ type: 'calendar_event', operation: 'read', description: "View this week's calendar schedule" }],
      },
    };
    aiAPI.sendMessage.mockResolvedValue(aiResponse);

    // Mock calendar API response
    const calendarEvents = {
      data: [
        { id: 1, summary: 'Test Event 1', start: { dateTime: '2024-01-01T10:00:00Z' } },
        { id: 2, summary: 'Test Event 2', start: { dateTime: '2024-01-02T12:00:00Z' } },
      ],
    };
    calendarAPI.getEvents.mockResolvedValue(calendarEvents);

    render(<AIChat />);

    // Wait for the input to appear
    const input = await screen.findByPlaceholderText("Tell me what you'd like to work on today...");
    fireEvent.change(input, { target: { value: "what's my schedule this week" } });

    const sendButton = screen.getByText('Send');
    fireEvent.click(sendButton);

    // Wait for the AI response to be processed and calendar events to be rendered
    await waitFor(() => {
      expect(aiAPI.sendMessage).toHaveBeenCalledWith("what's my schedule this week", 'thread-123');
    });

    await waitFor(() => {
        expect(calendarAPI.getEvents).toHaveBeenCalled();
    });

    // Check that calendar events are rendered
    await waitFor(() => {
      expect(screen.getByText('Monthly Calendar')).toBeInTheDocument();
    });

    // Simulate clicking on a day to show events
    fireEvent.mouseDown(screen.getByText('1'));

    await waitFor(() => {
        expect(screen.getByText((content) => content.includes('Test Event 1'))).toBeInTheDocument();
    });
    expect(screen.getByText((content) => content.includes('Test Event 2'))).toBeInTheDocument();
  });

  it('should render only events for the requested date when due_date is present in the Gemini response', async () => {
    const aiResponse = {
      data: {
        message: "I've processed your request and created 1 action:",
        actions: [{ type: 'calendar_event', operation: 'read', data: { due_date: '2024-07-09' } }],
      },
    };
    aiAPI.sendMessage.mockResolvedValue(aiResponse);

    const calendarEvents = {
      data: [
        { id: 1, summary: 'Event On Date', start: { date: '2024-07-09' } },
        { id: 2, summary: 'Event Not On Date', start: { date: '2024-07-10' } },
      ],
    };
    calendarAPI.getEvents.mockResolvedValue(calendarEvents);

    render(<AIChat />);
    const input = await screen.findByPlaceholderText("Tell me what you'd like to work on today...");
    fireEvent.change(input, { target: { value: "show me my schedule for 2024-07-09" } });
    const sendButton = screen.getByText('Send');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(aiAPI.sendMessage).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(calendarAPI.getEvents).toHaveBeenCalled();
    });

    await waitFor(() => {
        expect(screen.getByText((content) => content.includes('Event On Date'))).toBeInTheDocument();
    });
    expect(screen.queryByText((content) => content.includes('Event Not On Date'))).not.toBeInTheDocument();
  });

  it('should render events for the correct date even if event start.dateTime is in a different timezone', async () => {
    const aiResponse = {
      data: {
        message: "I've processed your request and created 1 action:",
        actions: [{ type: 'calendar_event', operation: 'read', data: { due_date: '2025-07-09' } }],
      },
    };
    aiAPI.sendMessage.mockResolvedValue(aiResponse);

    const calendarEvents = {
      data: [
        { id: 1, summary: 'Morning Event', start: { dateTime: '2025-07-09T07:00:00-05:00' } },
        { id: 2, summary: 'Other Day', start: { dateTime: '2025-07-10T07:00:00-05:00' } },
      ],
    };
    calendarAPI.getEvents.mockResolvedValue(calendarEvents);

    render(<AIChat />);
    const input = await screen.findByPlaceholderText("Tell me what you'd like to work on today...");
    fireEvent.change(input, { target: { value: "show only wednesday" } });
    const sendButton = screen.getByText('Send');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(aiAPI.sendMessage).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(calendarAPI.getEvents).toHaveBeenCalled();
    });

    await waitFor(() => {
        expect(screen.getByText((content) => content.includes('Morning Event'))).toBeInTheDocument();
    });
    expect(screen.queryByText((content) => content.includes('Other Day'))).not.toBeInTheDocument();
  });

  it('should render only the filtered tasks from the code block (e.g., high priority)', async () => {
    // Simulate a Gemini/AI response with a code block containing only high priority tasks
    const highPriorityTask = {
      id: '1',
      title: 'High Priority Task',
      priority: 'high',
      completed: false,
    };
    const _lowPriorityTask = {
      id: '2',
      title: 'Low Priority Task',
      priority: 'low',
      completed: false,
    };
    // The code block only contains the high priority task
    const aiMessage = `Here are your tasks:\n\n\`\`\`json\n${JSON.stringify({
      action_type: 'read',
      entity_type: 'task',
      details: { tasks: [highPriorityTask] }
    }, null, 2)}\`\`\``;

    // Render the chat with a message containing the code block
    render(
      <AIChat
        initialMessages={[{
          id: 'msg-1',
          type: 'ai',
          content: aiMessage,
          timestamp: new Date(),
        }]}
      />
    );

    // The high priority task should be visible
    const highPriorityTasks = await screen.findAllByText('High Priority Task');
    expect(highPriorityTasks.length).toBeGreaterThan(0);
    // The low priority task should NOT be visible
    expect(screen.queryByText('Low Priority Task')).not.toBeInTheDocument();
  });
}); 