'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./target.cjs');
const ORIGIN = 'http://127.0.0.1:5173';

function credential(email) {
  // Read only the existing demo login record. Never persist or log credentials/cookies.
  const { windowsPrivateIdentity } = require('../lib/gemini-live-runtime.cjs');
  const file = path.join(windowsPrivateIdentity().privateRoot, 'fixture-demo-accounts.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8')).accounts.find(a => a.email === email);
  if (!value) throw Error('EXISTING_DEMO_LOGIN_REQUIRED: ' + email);
  return value;
}

async function login(email) {
  const c = credential(email);
  const response = await fetch(ORIGIN + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  if (!response.ok) throw Error('DEMO_LOGIN_FAILED: ' + response.status);
  const cookie = response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  if (!cookie) throw Error('AUTH_COOKIE_REQUIRED');
  async function request(route, method = 'GET', body) {
    if (!route.startsWith('/api/')) throw Error('LOCAL_API_ROUTE_REQUIRED');
    const multipart = body instanceof FormData;
    const r = await fetch(ORIGIN + route, { method,
      headers: { cookie, origin: ORIGIN, ...(body && !multipart ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
    });
    if (!r.ok) throw Error(`${method} ${route}: ${r.status} ${(await r.text()).slice(0,700)}`);
    if (r.status === 204) return null;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }
  return { request, credential: c, cookie };
}
module.exports = { login, credential, ORIGIN, ROOT };
