import { tasksAPI } from '../../services/api';
import { configService } from '../../services/config';

jest.mock('../../services/auth', () => ({
  authService: { getAuthToken: jest.fn(async () => 'test-token') }
}));

describe('tasksAPI.focusNext', () => {
  const originalFetch = global.fetch as any;
  beforeEach(() => {
    // @ts-ignore
    global.fetch = jest.fn(async (url, init) => ({
      ok: true,
      json: async () => ({ id: 'n1', title: 'Next Task', is_today_focus: true }),
      status: 200,
      text: async () => '',
    }));
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs to /tasks/focus/next with provided payload', async () => {
    const base = configService.getBaseUrl();
    const payload = { current_task_id: 't1', travel_preference: 'allow_travel' as const, exclude_ids: ['t1'] };
    const result = await tasksAPI.focusNext(payload);
    expect(result).toHaveProperty('id');
    expect((global.fetch as any)).toHaveBeenCalledWith(
      `${base}/tasks/focus/next`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })
    );
  });
});


