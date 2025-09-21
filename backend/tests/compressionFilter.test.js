import { describe, it, expect, beforeEach } from 'vitest';
import { compressionConfig } from '../src/middleware/security.js';

describe('Compression Filter', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      headers: {},
      path: '/api/test',
      user: null
    };
    mockRes = {
      getHeader: () => null,
      setHeader: () => {}
    };
  });

  // Table-driven tests for endpoint compression behavior
  describe('endpoint compression behavior', () => {
    const testCases = [
      {
        description: 'should compress public endpoints without user authentication',
        path: '/api/health',
        user: null,
        expected: true
      },
      {
        description: 'should not compress when user is authenticated',
        path: '/api/health',
        user: { id: '123', email: 'test@example.com' },
        expected: false
      },
      {
        description: 'should not compress authentication endpoints',
        path: '/api/auth/login',
        user: null,
        expected: false
      },
      {
        description: 'should not compress security endpoints',
        path: '/api/security/summary',
        user: null,
        expected: false
      },
      {
        description: 'should not compress protected endpoints',
        path: '/api/protected',
        user: null,
        expected: false
      },
      {
        description: 'should not compress user token endpoints',
        path: '/api/user/tokens',
        user: null,
        expected: false
      },
      {
        description: 'should not compress user credential endpoints',
        path: '/api/user/credentials',
        user: null,
        expected: false
      },
      {
        description: 'should compress regular public endpoints',
        path: '/api/goals',
        user: null,
        expected: true
      },
      {
        description: 'should compress tasks endpoints',
        path: '/api/tasks',
        user: null,
        expected: true
      }
    ];

    it.each(testCases)('$description', ({ path, user, expected }) => {
      mockReq.path = path;
      mockReq.user = user;
      
      const result = compressionConfig.filter(mockReq, mockRes);
      expect(result).toBe(expected);
    });
  });

  it('should not compress when no-transform cache-control is present', () => {
    mockReq.path = '/api/health';
    mockReq.headers['cache-control'] = 'no-transform';
    mockReq.user = null;
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(false);
  });

  it('should not compress binary responses (e.g., images)', () => {
    mockReq.path = '/api/goals';
    mockReq.user = null;
    mockRes.getHeader = (name) => (name.toLowerCase() === 'content-type' ? 'image/png' : undefined);
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(false);
  });
});
