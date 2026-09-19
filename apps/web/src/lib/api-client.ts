const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const baseUrl = configuredBaseUrl || '/api';

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}
