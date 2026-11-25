# Approved offer price review on integrated QA

`001-price-review.sql` and `002-event-state.sql` are independent additive migrations
for the verified integrated QA OID 953322. They do not run or mark Prisma migrations
33/34. The migration scripts require the existing `runtime_v2.assert_target()`
identity guard and are applied atomically with SHA-256 receipts in
`academic_offer_v2.migrations`. Do not rerun an applied migration or edit its bytes.

The ledger records complete CourseVersion snapshots for draft saves, submission,
return to draft, PO price confirmation and publication. Inserts require a current
authenticated, active HVU principal; approval events additionally require an
independent scoped `academic.program.approve` grant. Events and migration receipts
are immutable. A database trigger prevents publication without a matching price
confirmation of the exact pending snapshot. The reviewer must supply the actual
PO decision reference; checking a box does not itself establish a PO decision.

The existing public CourseVersion and ClassOffering history/price triggers remain
enabled and unchanged. A new class copies the effective published version's price
and terms, requires explicit capacity and dates, and starts DRAFT. Opening the
offer requires `academic.admission.approve` scoped to that class. It never holds a
seat, creates a payment, or grants LMS access. Legacy classes are not repriced or
retrospectively linked. Existing TEST admissions and SePay source guards remain.

With no PO price supplied, retain a single UNKNOWN-price DRAFT. Do not publish a
test version, mint a LIVE obligation, or substitute a legacy price to pass a test.
Rollback of business operations is not deletion of ledger/history; use a reviewed
forward migration for schema corrections. Restore rehearsal is outside this batch.

## DEC-071 approved QA admission

`003-dec071-admission.sql` adds an immutable admission binding for newly created
classes of the explicitly approved version `d326340a-f8a2-4daf-a732-e93afe0a3a4c`
at 400000 VND. Binding requires the verified integrated database, current scoped
HVU/session, an OPEN offer and the existing `w07_price` snapshot check. It never
retrofits a legacy class or changes an existing TEST admission.

The W07 consent guard accepts `W07_DEC071_ADMISSION_V1` only through that binding.
Every old principal, scope, state, immutable obligation, price, balance and
ownership invariant remains. QA admission/decision/obligation audits carry DEC-071
provenance; TEST paths retain their original labels. Manual TEST finance and W07
entitlement commands are blocked for this consent. A scoped, independent cashier
may authorize the payment source for the existing SePay order service; this does
not confirm receipt of funds or activate LMS.

Runtime `W07_ENABLED=QA_DEC071` requires `DEC071_INTEGRATED_QA` and the separate
`w07-dec071-target.cjs` guard before importing the application pool. The guard pins
native port55401, database/OID953322, physical identity, marker, directory and
source/migration checksums. The original DEC049 and CF target guards are retained.
SePay webhook, credentials and existing immutable order code are reused unchanged.
