import { tasksAPI } from '../../services/api';
import { configService } from '../../services/config';
import { secureConfigService } from '../../services/secureConfig';
import logger from '../../utils/logger';

// Helper function to get secure API base URL
const getSecureApiBaseUrl = (): string => {
  try {
    return secureConfigService.getApiBaseUrl();
  } catch (error) {
    logger.warn('Failed to get secure API base URL, falling back to config service:', error);
    return configService.getBaseUrl();
  }
};

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
    const base = getSecureApiBaseUrl();
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


