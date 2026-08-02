const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export type ApiEnvelope<T> = {
  data: T;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages?: number;
  } | null;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
};

let accessToken: string | null = localStorage.getItem('ims_access_token');

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem('ims_access_token', token);
  else localStorage.removeItem('ims_access_token');
}

export function getAccessToken() {
  return accessToken;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const json = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `Request failed (${res.status})`);
  }
  return json;
}
