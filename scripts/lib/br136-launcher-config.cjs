'use strict';
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
module.exports = Object.freeze({
  ROOT, PUBLIC_ORIGIN: 'https://oink-crazed-frosting.ngrok-free.dev',
  LOCAL_ORIGIN: 'http://127.0.0.1:3040', WEBHOOK: '/api/v2/payments/sepay/webhook',
  DATABASE: 'v2_wave01_dev_test_w04b_br136_demo_20261111_42db33', OID: '1313121',
  PHYSICAL: '7702384118803149788', MARKER: 'SMART_ENGLISH_DISPOSABLE_E2E_V1',
  DATA: path.join(ROOT, '.local-storage/v2-wave01/postgres'),
  STATE: path.join(ROOT, '.local-storage/br136-launcher'),
  DIST: path.join(ROOT, 'apps/web/dist'),
});
