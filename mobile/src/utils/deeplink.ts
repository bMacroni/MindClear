export function parseAccessTokenFromUrl(url: string): { 
  access_token?: string; 
  refresh_token?: string; 
  token?: string;
  code?: string;
  error?: string;
  error_description?: string;
} {
  try {
    if (!url) return {};
    // Split out fragment and query parts
    const fragment = url.split('#')[1] ?? '';
    const query = url.split('?')[1]?.split('#')[0] ?? '';

    // Parse both sets of params
    const fragmentParams = new URLSearchParams(fragment);
    const queryParams = new URLSearchParams(query);

    // Prefer tokens in the fragment, fallback to query
    const access_token =
      fragmentParams.get('access_token') ?? queryParams.get('access_token') ?? undefined;
    const refresh_token =
      fragmentParams.get('refresh_token') ?? queryParams.get('refresh_token') ?? undefined;
    const token =
      fragmentParams.get('token') ?? queryParams.get('token') ?? undefined; // recovery token from Supabase verify
    const code =
      queryParams.get('code') ?? fragmentParams.get('code') ?? undefined; // PKCE auth code
    
    // Check for errors
    const error = 
      fragmentParams.get('error') ?? queryParams.get('error') ?? undefined;
    const error_description = 
      fragmentParams.get('error_description') ?? queryParams.get('error_description') ?? undefined;

    return { access_token, refresh_token, token, code, error, error_description };
  } catch {
    return {};
  }
}
