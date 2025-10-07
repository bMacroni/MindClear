import { describe, it, expect } from 'vitest';
import { parseAccessTokenFromUrl } from '../utils/deeplink';

describe('parseAccessTokenFromUrl', () => {
  it('parses access_token from fragment', () => {
    const url = 'mindclear://reset-password#access_token=abc123&token_type=bearer';
    expect(parseAccessTokenFromUrl(url).access_token).toBe('abc123');
  });

  it('parses access_token from query', () => {
    const url = 'mindclear://reset-password?access_token=xyz987&foo=bar';
    expect(parseAccessTokenFromUrl(url).access_token).toBe('xyz987');
  });

  it('returns empty when token missing', () => {
    const url = 'mindclear://reset-password?foo=bar';
    expect(parseAccessTokenFromUrl(url).access_token).toBeUndefined();
  });
});


