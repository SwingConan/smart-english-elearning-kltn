# CMS QA migration lane — DEC-070 / BR-V2-112

This additive lane creates only `cms_v2`; it neither executes Prisma migrations33/34 nor marks them applied. The original 32 Prisma rows and legacy tables remain untouched. `001` installs immutable revisions, state/publication events, scope grants, person identities, audit and transaction commands. `002` corrects an ambiguous PL/pgSQL variable in replacement publication; the original migration checksum and historical rows stay intact.

Verify with the independently captured target receipt:

```powershell
node apps/api/sql/cms/migrate.cjs --target=.local-storage/w10-cms-complete-02/QA_TARGET.json
```

For an authorized, separate QA target, append `--apply` to apply missing CMS migrations transactionally. The runner requires the exact database OID/physical identity/marker, native loopback port 55401, wave01 role, pinned data directory and unchanged 32-row Prisma ledger. It refuses baseline OID 20986, unknown CMS migrations and checksum drift. Existing migration files must never be rewritten after application.

Scope grants are a CMS-specific RBAC extension because the legacy W01 constraint has no CMS resource type. CMS uses the existing users, live sessions and W01 revocation lock, plus explicit `cms_v2.grants` and immutable person mappings; no GLOBAL or role-derived grant is added. Normal UI/API has no grant/person administration endpoint. The PO-authorized batch bootstrap records the exact TV/HVU accounts, shared-person HVU alias and 48-hour, one-scope grants. It creates no CMS article; articles are written through the website. Unmapped/ungranted accounts have no CMS access.

Runtime requires `W10_CMS_ENABLED=DEV_DEC070`, exact `W10_CMS_EXPECTED_DATABASE`, `W10_CMS_VERIFIED_OID`, `W10_CMS_PHYSICAL_ID` and matching `DATABASE_URL/E2E_DATABASE_URL`. The batch launcher verifies both independent CMS checksums and the original Prisma ledger before opening listeners. It cannot enable CMS in production or on a legacy target.

Text only: original team-authored QA content under the approved policy. The server binds the policy and body digest to each immutable revision; callers cannot supply clearance, author/person or approval. Review and publication recheck live scope rights and exclude all inherited authors by person identity in PostgreSQL. Public reads use only current publication pointers with the exact revision approval and independent publisher. Per-content PUBLISHED does not change the global release flag.
