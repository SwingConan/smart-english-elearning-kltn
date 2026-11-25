import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export async function verifyBrowserFixture(env = process.env) {
  const origin = env.E2E_FIXTURE_ORIGIN;
  const nonce = env.E2E_FIXTURE_NONCE;
  if (origin !== 'http://127.0.0.1:5175' || !/^[a-f0-9-]{36}$/.test(nonce ?? ''))
    throw new Error('E2E_BROWSER_FIXTURE_REQUIRED: no arbitrary existing browser/backend');
  await require('./e2e-target.cjs').verify(env);
  const response = await fetch(origin + '/api/health', {
    redirect: 'error',
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok || response.headers.get('X-Smart-English-E2E-Fixture') !== nonce)
    throw new Error('E2E_BROWSER_BACKEND_BINDING_REJECTED');
  return origin;
}
