import { conversationService } from '../conversationService';
import * as api from '../apiService';

jest.mock('../apiService');

describe('conversationService.getThread', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('appends limit query and uses provided timeout', async () => {
    const apiFetch = api.apiFetch as unknown as jest.Mock;
    apiFetch.mockResolvedValue({ ok: true, status: 200, data: { thread: { id: 't1' }, messages: [] } });

    await conversationService.getThread('t1', { limit: 50, timeoutMs: 60000 });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init, timeout] = apiFetch.mock.calls[0];
    expect(path).toBe('/ai/threads/t1?limit=50');
    expect(init).toEqual({ method: 'GET' });
    expect(timeout).toBe(60000);
  });

  it('uses defaults when options not provided', async () => {
    const apiFetch = api.apiFetch as unknown as jest.Mock;
    apiFetch.mockResolvedValue({ ok: true, status: 200, data: { thread: { id: 't2' }, messages: [] } });

    await conversationService.getThread('t2');

    const [path, init, timeout] = (api.apiFetch as unknown as jest.Mock).mock.calls[0];
    expect(path).toBe('/ai/threads/t2');
    expect(init).toEqual({ method: 'GET' });
    expect(timeout).toBe(25000);
  });
});






