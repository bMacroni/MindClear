export function parseAccessTokenFromUrl(url: string): { access_token?: string; token?: string } {
  try {
    if (!url) return {};
    const hasFragment = url.includes('#');
    const raw = hasFragment ? url.split('#')[1] : (url.split('?')[1] || '');
    if (!raw) return {};
    const params = new URLSearchParams(raw);
    const access_token = params.get('access_token') || undefined;
    const token = params.get('token') || undefined; // recovery token from Supabase verify
    return { access_token, token };
  } catch {
    return {};
  }
}


