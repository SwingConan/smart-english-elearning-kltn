import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api-client';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiFetch headers', () => {
  it('does not add a JSON Content-Type header to GET requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());

    await apiFetch('/courses');

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it.each(['POST', 'PATCH'])('adds JSON Content-Type for %s JSON bodies', async (method) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());

    await apiFetch('/admin/courses', {
      method,
      body: JSON.stringify({ title: 'Course' }),
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('preserves caller-provided headers without overriding Content-Type', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());

    await apiFetch('/custom', {
      method: 'POST',
      body: 'plain text',
      headers: {
        'Content-Type': 'text/plain',
        'X-Request-Source': 'test',
      },
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('Content-Type')).toBe('text/plain');
    expect(headers.get('X-Request-Source')).toBe('test');
  });

  it('does not label an untyped plain-text body as JSON', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());

    await apiFetch('/custom', { method: 'POST', body: 'plain text' });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.has('Content-Type')).toBe(false);
  });
});

function response(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
