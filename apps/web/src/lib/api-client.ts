import { confirmDemoEnvironment, presentDemoResponse } from '@/features/demo/presentation';
const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const baseUrl = configuredBaseUrl || '/api';

export function apiUrl(path: string): string {
  return `${baseUrl}${path}`;
}

function extractApiErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const raw = (body as { message?: unknown }).message;
    if (Array.isArray(raw)) {
      const joined = raw
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .join('; ');
      if (joined) return joined;
    } else if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw;
    }
  }
  if (typeof body === 'string' && body.trim().length > 0) {
    return body;
  }
  return `Request failed with status ${status}`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(extractApiErrorMessage(status, body));
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (isJsonBody(init.body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  });

  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  if (response.headers.get('X-Smart-English-Environment') === 'demo') {
    confirmDemoEnvironment();
    return presentDemoResponse(body) as T;
  }
  return body as T;
}

function isJsonBody(body: BodyInit | null | undefined): boolean {
  if (typeof body !== 'string') {
    return false;
  }

  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  if (!text) {
    return undefined;
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return JSON.parse(text) as unknown;
  }

  return text;
}
