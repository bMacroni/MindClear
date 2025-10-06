export function parseAccessTokenFromUrl(url: string): { access_token?: string; token?: string } {
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
    const token =
      fragmentParams.get('token') ?? queryParams.get('token') ?? undefined; // recovery token from Supabase verify

    return { access_token, token };
  } catch {
    return {};
  }
}


