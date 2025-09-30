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
    const res = await apiFetch<ConversationThread[]>('/ai/threads', { method: 'GET' }, 25000);
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

  async getThread(threadId: string): Promise<ConversationThreadWithMessages> {
    const res = await apiFetch<ConversationThreadWithMessages>(`/ai/threads/${threadId}`, { method: 'GET' }, 25000);
    if (!res.ok) throw new Error((res.data as any)?.error || 'Failed to load thread');
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
    if (!updates.title && updates.summary === undefined) {
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
  }
};



