# SePay receiver on the integrated QA target

Authority: PO `V2-W07-SEPAY-FULLSTACK-01`. Apply only on verified QA OID **953322**,
native port 55401, physical cluster `7702384118803149788`, using its immutable
`runtime_v2` binding. These three additive migrations have their own `sepay_v2.migrations`
ledger; do not run the Prisma migration runner, migrations33/34, or modify source databases.

The batch installed `001-live-ledger.sql`, then appended `002-source-authority.sql`
and `003-provider-readback.sql`. Original applied files/checksums are retained.
All financial/decision tables are append only. Idempotency binds the authenticated
SePay bank account to the provider transaction ID; conflicting content becomes an
exception. A distinct provider transaction UUID cannot confirm multiple receipts.

Existing W07 is TEST-only: its SQL requires `W07_SYNTHETIC_ADMISSION_V1` and TEST
payment evidence. This integration does not change that source guard or convert
its obligations into real debts. LIVE orders require an existing independently
approved, non-TEST W07 obligation, immutable approved price/version and an explicitly
authorized `live_sources` record backed by current resource grants. The QA source
currently has zero obligations and zero eligible approved class versions. There is
no endpoint that fabricates or self-approves that upstream source.

SePay receiver configuration is loaded from `SEPAY_CONFIG_FILE`, an ignored absolute
`*.private.json` under `.local-storage`, written with owner-only ACL. No credential
is accepted by a product API or stored in a migration. Use the operator script:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File scripts/configure-sepay-operator.ps1
```

The wizard reads LIVE bank accounts from SePay API v2 in the operator's window,
requires selection/confirmation of the intended center account and HMAC secret,
then saves privately. Backend independently verifies account UUID, active state,
number, owner and bank code. VA is blocked until its separate verification exists.

Webhook: `POST /api/v2/payments/sepay/webhook`, JSON only. HMAC-SHA256 covers
`timestamp.raw_body`; `X-SePay-Timestamp` tolerance ±300 seconds. No API-key fallback,
frontend confirmation, redirect confirmation or return-URL settlement is accepted.
The callback tunnel exposes only that path, with a 64 KiB body bound. It never
exposes login, the frontend, admin APIs or local contract checks.

Exact incoming notifications remain pending independent cashier reconciliation.
Confirmation additionally performs a read-only SePay API v2 transaction lookup by
bank UUID and exact reference; amount, direction, date, receiver, code and content
must match one actual bank record. Missing/partial/excess/wrong-code payments cannot
be confirmed by bypassing their exception. Unknown-class transactions remain hidden
until bank-account reconciliation scope is approved. No Enrollment/entitlement is
changed; the old W07 gate is preserved.

Local signed contract checks use a separate private route/table and explicit
`DEV_ONLY` flag. They never enter the LIVE inbox, financial ledger, order or school
access tables. Their PASS is not SEPAY LIVE acceptance.

Official references read for this implementation:

- [Webhook payload and acknowledgement](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook)
- [HMAC/raw bytes/timestamp](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc)
- [Bank identity API v2](https://developer.sepay.vn/vi/sepay-api/v2/tai-khoan-ngan-hang/chi-tiet)
- [Transaction readback filters](https://developer.sepay.vn/vi/sepay-api/v2/giao-dich/danh-sach)
- [VietQR URL](https://developer.sepay.vn/vi/sepay-webhooks/tao-qr-va-form-thanh-toan)

Local runtime, narrow callback proxy, install helpers and receipts remain under
`.local-storage/v2-w07-sepay-fullstack-01`. Cloudflare Quick Tunnel is temporary QA
infrastructure, not a production hosting or availability approval. Never initiate
a bank transfer from a test script. A small real transfer requires separate operator
approval after all academic, fee, receiver, callback and scope conditions pass.
