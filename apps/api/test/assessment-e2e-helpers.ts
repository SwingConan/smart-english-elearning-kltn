import * as request from 'supertest';

export async function loginAgent(
  agent: ReturnType<typeof request.agent>,
  email: string,
  password: string,
  sessionIds: Set<string>,
): Promise<void> {
  const response = await agent.post('/api/auth/login').send({ email, password }).expect(200);
  sessionIds.add(extractSessionId(readCookie(response.headers['set-cookie'])));
}

export function expectSafeError(response: request.Response): void {
  expect(response.text).not.toMatch(/Prisma|P2002|P2003|P2034|stack|database/i);
}

function readCookie(value: string[] | string | undefined): string {
  const cookie = Array.isArray(value) ? value[0] : value;
  if (!cookie) throw new Error('Expected session cookie');
  return cookie;
}

function extractSessionId(value: string): string {
  const signed = decodeURIComponent(value.split(';', 1)[0].split('=', 2)[1]);
  const unsigned = signed.startsWith('s:') ? signed.slice(2) : signed;
  return unsigned.slice(0, unsigned.lastIndexOf('.'));
}
