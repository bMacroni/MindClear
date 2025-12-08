import { apiService, apiFetch } from './apiService';

export interface ConversationThread {
  id: string;
  title: string;
  summary?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message?: {
    content: string;
    role: 'user' | 'assistant';
    created_at: string;
  } | null;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  created_at: string;
}

export interface ConversationThreadWithMessages {
  thread: ConversationThread;
  messages: ConversationMessage[];
}

export const conversationService = {
  async listThreads(): Promise<ConversationThread[]> {
    const res = await apiFetch<ConversationThread[]>('/ai/threads', { method: 'GET' }, 30000);
    if (!res.ok) throw new Error((res.data as any)?.error || 'Failed to load threads');
    return res.data as ConversationThread[];
  },

  async createThread(title?: string, summary?: string | null): Promise<ConversationThread> {
    // Simple retry to handle transient cold starts/timeouts
    const attempt = async () => apiService.post<ConversationThread>('/ai/threads', { title, summary }, { timeoutMs: 30000 });
    let res = await attempt();
    if (!res.ok && (res.status === 408 || (res.data as any)?.code === 'TIMEOUT')) {
      await new Promise(r => setTimeout(r, 400));
      res = await attempt();
    }
    if (!res.ok) throw new Error((res.data as any)?.error || 'Failed to create thread');
    return res.data as ConversationThread;
    },

  async getThread(threadId: string, options?: { limit?: number; timeoutMs?: number }): Promise<ConversationThreadWithMessages> {
    const qs = options?.limit ? `?limit=${encodeURIComponent(String(options.limit))}` : '';
    const timeout = options?.timeoutMs ?? 25000;
    const res = await apiFetch<ConversationThreadWithMessages>(`/ai/threads/${threadId}${qs}`, { method: 'GET' }, timeout);
    if (!res.ok) {
      const error = new Error((res.data as any)?.error || 'Failed to load thread');
      (error as any).status = res.status;
      (error as any).response = { status: res.status };
      throw error;
    }
    return res.data as ConversationThreadWithMessages;
  },

  async updateThread(
    threadId: string,
    updates: { title?: string; summary?: string | null }
  ): Promise<ConversationThread> {
    // Validate inputs
    if (!threadId?.trim()) {
      throw new Error('Thread ID is required');
    }
    const hasNonEmptyTitle = typeof updates.title === 'string' && updates.title.trim().length > 0;
    let hasProvidedSummary = false;
    if (updates.summary !== undefined) {
      hasProvidedSummary = typeof updates.summary === 'string'
        ? updates.summary.trim().length > 0
        : true; // counts null or non-string values as provided
    }
    if (!hasNonEmptyTitle && !hasProvidedSummary) {
      throw new Error('At least one update field must be provided');
    }

    // Enforce a timeout for the API call
    const res = await apiService.put<ConversationThread>(
      `/ai/threads/${threadId}`,
      updates,
      { timeoutMs: 25000 }
    );

    if (!res.ok) {
      throw new Error((res.data as any)?.error || 'Failed to update thread');
    }

    return res.data as ConversationThread;
  },
  async deleteThread(threadId: string): Promise<void> {
    const res = await apiService.delete(`/ai/threads/${threadId}`, { timeoutMs: 20000 });
    if (!res.ok) throw new Error((res.data as any)?.error || 'Failed to delete thread');
  },

  async bulkDeleteThreads(threadIds: string[], options: { concurrency?: number; timeoutMs?: number } = {}): Promise<{ success: string[]; failed: { id: string; error: any }[] }>{
    const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 6));
    const timeoutMs = options.timeoutMs ?? 20000;

    const queue = [...threadIds];
    const success: string[] = [];
    const failed: { id: string; error: any }[] = [];

    async function worker() {
      while (queue.length) {
        const id = queue.shift();
        if (!id) break;
        try {
          const res = await apiService.delete(`/ai/threads/${id}`, { timeoutMs });
          if (res.ok) {
            success.push(id);
          } else {
            failed.push({ id, error: (res.data as any)?.error || 'Request failed' });
          }
        } catch (err) {
          failed.push({ id, error: err });
        }
      }
    }

    const workers = Array.from({ length: concurrency }).map(() => worker());
    await Promise.all(workers);
    return { success, failed };
  },

  /**
   * Sends a message directly to AI chat endpoint.
   * Returns AI response with threadId (created automatically if not provided).
   * Used by AIChatScreen for immediate chat interaction.
   */
  async sendMessage(
    message: string,
    threadId?: string | null,
    modelMode: 'fast' | 'smart' = 'fast'
  ): Promise<{
    message: string;
    actions: any[];
    threadId: string | null;
    modelMode?: 'fast' | 'smart';
    provider?: string;
  }> {
    const res = await apiService.post<{ message: string; actions: any[]; threadId: string | null; modelMode?: 'fast' | 'smart'; provider?: string }>(
      '/ai/chat',
      { message, threadId: threadId || undefined, modelMode },
      { timeoutMs: 60000 } // Longer timeout for AI responses
    );    
    if (!res.ok) {
      throw new Error((res.data as any)?.error || 'Failed to send message');
    }

    return res.data;
  },

  /**
   * Sends a message via AI chat endpoint for sync purposes.
   * Returns both user and assistant messages as saved by the server.
   * Used by SyncService to sync pending user messages.
   */
  async syncSendMessage(
    threadId: string,
    message: string,
    modelMode: 'fast' | 'smart' = 'fast'
  ): Promise<{
    userMessage: { id: string; created_at: string; updated_at: string };
    assistantMessage: { id: string; content: string; created_at: string; updated_at: string; metadata?: any };
  }> {
    const res = await apiService.post<{ message: string; actions: any[]; threadId?: string | null }>(
      '/ai/chat',
      { message, threadId, modelMode },
      { timeoutMs: 60000 } // Longer timeout for AI responses
    );
    
    if (!res.ok) {
      throw new Error((res.data as any)?.error || 'Failed to send message');
    }

    // After sending, fetch the thread to get the messages that were saved
    const returnedThreadId = (res.data as any).threadId || threadId;
    if (!returnedThreadId) {
      throw new Error('No threadId returned from chat endpoint');
    }

    const threadData = await this.getThread(returnedThreadId);
    
    // Find the last user message and assistant message
    const messages = threadData.messages || [];
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    const lastUserMessage = userMessages[userMessages.length - 1];
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

    if (!lastUserMessage || !lastAssistantMessage) {
      throw new Error('Failed to retrieve messages after sending');
    }

    return {
      userMessage: {
        id: lastUserMessage.id,
        created_at: lastUserMessage.created_at,
        updated_at: lastUserMessage.created_at, // Messages don't have updated_at typically
      },
      assistantMessage: {
        id: lastAssistantMessage.id,
        content: lastAssistantMessage.content,
        created_at: lastAssistantMessage.created_at,
        updated_at: lastAssistantMessage.created_at,
        metadata: lastAssistantMessage.metadata,
      },
    };
  },
};



