'use strict';
function assertSePayReadbackTarget(input, options = {}) {
  let url;
  try { url = new URL(input instanceof URL ? input.href : typeof input === 'string' ? input : input.url); }
  catch { throw Error('DEMO_UNAPPROVED_EXTERNAL_FETCH_BLOCKED'); }
  const method = options.method || (typeof input === 'object' && input?.method) || 'GET';
  if (method !== 'GET' || url.origin !== 'https://userapi.sepay.vn'
    || !/^\/v2\/(bank-accounts\/[a-f0-9-]{36}|transactions)$/.test(url.pathname))
    throw Error('DEMO_UNAPPROVED_EXTERNAL_FETCH_BLOCKED');
  return url;
}
module.exports = { assertSePayReadbackTarget };
