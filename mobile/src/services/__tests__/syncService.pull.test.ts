import { syncService } from '../SyncService';
import * as conv from '../conversationService';
import { enhancedAPI } from '../enhancedApi';

jest.mock('../conversationService');

describe('SyncService.pullData message fetching', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('uses limited getThread with 60s timeout and tolerates timeouts per thread', async () => {
    // Minimal API responses for non-conversation resources
    jest.spyOn(enhancedAPI, 'getEvents').mockResolvedValue({ changed: [], deleted: [] } as any);
    jest.spyOn(enhancedAPI, 'getTasks').mockResolvedValue({ changed: [], deleted: [] } as any);
    jest.spyOn(enhancedAPI, 'getGoals').mockResolvedValue({ changed: [], deleted: [] } as any);
    jest.spyOn(enhancedAPI, 'getMilestones').mockResolvedValue({ changed: [], deleted: [] } as any);
    jest.spyOn(enhancedAPI, 'getMilestoneSteps').mockResolvedValue({ changed: [], deleted: [] } as any);

    // Threads list contains one thread
    (conv.conversationService.listThreads as unknown as jest.Mock).mockResolvedValue([
      { id: 'th1', title: 't', is_active: true, created_at: '', updated_at: '' },
    ]);

    // Simulate timeout error from getThread
    (conv.conversationService.getThread as unknown as jest.Mock).mockRejectedValue(new Error('Request timeout'));

    await expect(syncService.pullData()).resolves.toBeUndefined();

    // Ensure getThread was called with limit and timeout
    expect(conv.conversationService.getThread).toHaveBeenCalledWith('th1', { limit: 50, timeoutMs: 60000 });
  });
});


