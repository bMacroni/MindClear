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

  it('should compress public endpoints without user authentication', () => {
    mockReq.path = '/api/health';
    mockReq.user = null;
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(true);
  });

  it('should not compress when user is authenticated', () => {
    mockReq.path = '/api/health';
    mockReq.user = { id: '123', email: 'test@example.com' };
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(false);
  });

  it('should not compress authentication endpoints', () => {
    mockReq.path = '/api/auth/login';
    mockReq.user = null;
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(false);
  });

  it('should not compress security endpoints', () => {
    mockReq.path = '/api/security/summary';
    mockReq.user = null;
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(false);
  });

  it('should not compress protected endpoints', () => {
    mockReq.path = '/api/protected';
    mockReq.user = null;
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(false);
  });

  it('should not compress user token endpoints', () => {
    mockReq.path = '/api/user/tokens';
    mockReq.user = null;
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(false);
  });

  it('should not compress user credential endpoints', () => {
    mockReq.path = '/api/user/credentials';
    mockReq.user = null;
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(false);
  });

  it('should not compress when no-transform cache-control is present', () => {
    mockReq.path = '/api/health';
    mockReq.headers['cache-control'] = 'no-transform';
    mockReq.user = null;
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(false);
  });

  it('should compress regular public endpoints', () => {
    mockReq.path = '/api/goals';
    mockReq.user = null;
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(true);
  });

  it('should compress tasks endpoints', () => {
    mockReq.path = '/api/tasks';
    mockReq.user = null;
    
    const result = compressionConfig.filter(mockReq, mockRes);
    expect(result).toBe(true);
  });
});
