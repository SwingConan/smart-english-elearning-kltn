'use strict';
// Stable local target for ngrok. No public tunnel is opened by this script.
const http = require('node:http');
const { Client } = require('pg');
const endpoint = '/api/v2/payments/sepay/webhook';
async function main() {
  const db = new Client({ connectionString: 'postgresql://wave01@127.0.0.1:55401/v2_wave01_dev_test_w04b_br136_demo_20261111_42db33', connectionTimeoutMillis: 3000 });
  try { await db.connect(); await db.query('BEGIN READ ONLY'); await db.query('SELECT br136_bank_check.assert_target()'); await db.query('ROLLBACK'); }
  finally { await db.end(); }
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.url !== endpoint) { res.writeHead(404); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); res.end(); return; }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) { res.writeHead(415); res.end(); return; }
    let size = 0, oversized = false; const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 65536) { oversized = true; chunks.length = 0; if (!res.headersSent) { res.writeHead(413); res.end(); } }
      else if (!oversized) chunks.push(chunk);
    });
    req.on('end', () => {
      if (oversized) return;
      const body = Buffer.concat(chunks);
      const upstream = http.request({ host: '127.0.0.1', port: 3000, path: endpoint, method: 'POST', timeout: 25000,
        headers: { 'content-type': 'application/json', 'content-length': body.length,
          'x-sepay-timestamp': req.headers['x-sepay-timestamp'] || '', 'x-sepay-signature': req.headers['x-sepay-signature'] || '' } }, incoming => {
        res.writeHead(incoming.statusCode || 502, { 'Content-Type': 'application/json' }); incoming.pipe(res);
      });
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end('{"success":false}'); });
      upstream.end(body);
    });
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  server.listen({ host: '127.0.0.1', port: 3037, exclusive: true }, () => console.log(JSON.stringify({ status: 'WEBHOOK_PROXY_READY', host: '127.0.0.1', port: 3037, databaseOid: '1313121', publicTunnelStarted: false, requestBodiesLogged: false })));
  server.on('error', () => { console.error('WEBHOOK_PROXY_PORT_BLOCKED'); process.exitCode = 1; });
  const stop = () => { server.close(() => process.exit(0)); server.closeIdleConnections(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
main().catch(() => { console.error('WEBHOOK_PROXY_IDENTITY_BLOCKED'); process.exitCode = 1; });
