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

// Access token is kept in memory only (not localStorage) to reduce XSS exposure.
// The refresh token lives in an httpOnly cookie; on reload we call /auth/refresh
// to obtain a fresh access token.
export type ApiError = {
  message: string;
  code?: string;
  status?: number;
  requestId?: string;
  details?: Array<{ path?: string; message: string }>;
};

export class ApiRequestError extends Error implements ApiError {
  code?: string;
  status?: number;
  requestId?: string;
  details?: Array<{ path?: string; message: string }>;
  constructor(info: ApiError) {
    super(info.message);
    this.name = 'ApiRequestError';
    this.code = info.code;
    this.status = info.status;
    this.requestId = info.requestId;
    this.details = info.details;
  }
}

/** Turn any thrown error into a readable, user-facing message. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.details?.length) {
      const parts = error.details
        .map((d) => (d.path ? `${humanizePath(d.path)}: ${d.message}` : d.message))
        .slice(0, 4);
      return parts.join(' · ');
    }
    if (error.status === 0) return "Can't reach the server — check your connection.";
    if (error.message) return error.message;
    return error.requestId
      ? `Something went wrong. Reference: ${error.requestId}`
      : 'Something went wrong.';
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

function humanizePath(path: string): string {
  const key = path.replace(/^attributes\./, '').replace(/_/g, ' ');
  return key.charAt(0).toUpperCase() + key.slice(1);
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) return null;
        const json = (await res.json()) as ApiEnvelope<{ accessToken: string }>;
        const token = json.data?.accessToken ?? null;
        setAccessToken(token);
        return token;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/** Attempt to restore a session on app load using the refresh cookie. */
export async function bootstrapSession(): Promise<boolean> {
  const token = await refreshAccessToken();
  return Boolean(token);
}

async function rawFetch(path: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  try {
    return await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
  } catch {
    throw new ApiRequestError({
      message: "Can't reach the server — check your connection.",
      status: 0,
    });
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  let res = await rawFetch(path, options);

  // On an expired/invalid access token, refresh once and retry.
  const isAuthCall = path.startsWith('/auth/');
  if (res.status === 401 && !isAuthCall) {
    const token = await refreshAccessToken();
    if (token) {
      res = await rawFetch(path, options);
    }
  }

  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T> & {
    error?: { code: string; message: string; details?: unknown; requestId?: string } | null;
    requestId?: string;
  };
  if (!res.ok || json.error) {
    throw new ApiRequestError({
      message: json.error?.message ?? `Request failed (${res.status})`,
      code: json.error?.code,
      status: res.status,
      requestId: json.error?.requestId ?? json.requestId,
      details: Array.isArray(json.error?.details)
        ? (json.error?.details as Array<{ path?: string; message: string }>)
        : undefined,
    });
  }
  return json;
}
