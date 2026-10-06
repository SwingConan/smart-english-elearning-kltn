import { afterEach, describe, expect, it, vi } from 'vitest';
import { instructorApi } from './api';

afterEach(() => vi.restoreAllMocks());

describe('instructor resource upload', () => {
  it.each([[true, 'true'], [false, 'false']] as const)('sends the visible downloadability choice %s', async (choice, serialized) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'resource' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await instructorApi.resources.upload('lesson-id', 'Guide', new File(['guide'], 'guide.txt', { type: 'text/plain' }), choice);
    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(body.get('isDownloadable')).toBe(serialized);
    expect(body.get('title')).toBe('Guide');
  });
});
