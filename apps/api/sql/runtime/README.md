# One integrated QA target

Authority: PO `V2-UNIFIED-RUNTIME-01`. This independent ledger does not execute,
replace or mark Prisma migrations 33/34. All source databases remain read only.

`001-unified-binding.sql` belongs only on a newly verified disposable QA database
on native PostgreSQL port 55401, owned by `wave01`. Apply it in a transaction with
the binding, per-source provenance and its SHA-256 ledger entry. Do not execute
this file through the normal Prisma migration runner or on an existing source.

The batch installation helper and receipts are under
`.local-storage/v2-unified-runtime-01/`: `build-database.cjs`, `bind-target.cjs`,
`TRANSFER_PLAN.json`, `TRANSFER_RESULT.json`, `BINDING.json`, `QA_TARGET.json`.
These are local operator artifacts, not credentials to publish. The helper rejects
any transfer that has not passed row checksums, foreign keys and trigger checks.
It will not reinstall over a READY target.

The source CMS guard body is retained as `cms_v2.assert_source_target()` in the
new database. Its wrapper delegates to the independent integrated binding only
for the exact QA name family. The Placement guard remains unchanged. Backend
CMS checks also require the native address, matching DATABASE_URL/E2E_DATABASE_URL,
the expected database/OID, physical PostgreSQL identity and imported dataset hash.
Normal CMS mode continues using its existing source guard. No principal, resource
scope, academic approval or release flag is inferred from the binding.

Private `GET /api/v2/runtime/identity` revalidates the current session and target.
It is evidence for one connected target, not a release approval or a health claim
about other databases. It is unavailable when integrated QA mode is disabled.

Startup uses the local `runtime.mjs`: it verifies Prisma 32 + CMS 2 + runtime 1
checksums, probes ports 3000/5173 exclusively and uses copied media roots. Do not
kill an unidentified listener. Stop only its owned instance with `stop.cjs`.
