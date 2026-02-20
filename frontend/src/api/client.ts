const API_BASE = import.meta.env.VITE_API_BASE_URL;

type AuthTokenGetter = (forceRefresh?: boolean) => Promise<string | null>;

let getToken: AuthTokenGetter = () => Promise.resolve(null);

export function setAuthTokenGetter(fn: AuthTokenGetter) {
  getToken = fn;
}

async function fetchWithAuth(
  url: string,
  options: RequestInit,
  retryOn401 = true
): Promise<Response> {
  const token = await getToken(false);
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 && retryOn401) {
    const refreshedToken = await getToken(true);
    if (refreshedToken) {
      headers.set('Authorization', `Bearer ${refreshedToken}`);
      return fetch(url, { ...options, headers });
    }
  }
  return res;
}

export async function apiGet(path: string, init?: RequestInit) {
  const res = await fetchWithAuth(`${API_BASE}${path}`, {
    ...init,
    method: 'GET',
  });
  return res;
}

export async function apiPost(path: string, body?: unknown, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetchWithAuth(`${API_BASE}${path}`, {
    ...init,
    method: 'POST',
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return res;
}
