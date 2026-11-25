# W09-DF-S2: offline evidence boundary

This slice contains pure projection validators/normalizers. It loads no source
module, Prisma, database, service, timer or network client. S1 remains unchanged.
No certificate, grant, API, UI, migration or live-verification authority is added.

## Provenance is separate from source assertions

The input projection is compared against a separately supplied `ServerReadSnapshot`:
exact learner/enrollment/class/CourseVersion binding, policy/source pins, canonical
record contents, approval decisions and approved-rule resolutions must agree.
Raw `PUBLISHED`, `APPROVED`, an actor/role name or a copied approval object is
insufficient. A JSON snapshot, including a string-key marker lookalike, is not
accepted. The non-serializable `SERVER_READ_SNAPSHOT` symbol distinguishes a
server argument from ordinary JSON; **the symbol is not cryptographic proof,
authentication, a grant, or independent verification**.

Only a future authenticated server read boundary may attach that symbol after
actual checks. S2 deliberately offers no public loader or factory to bless client
payloads. Server code can misuse a symbol/typed context; the runtime integration
must not deserialize the provenance context from HTTP, spread client input into
it, or build its records/decisions/resolutions from the same unverified payload.
All results explicitly say `OFFLINE_CONSISTENCY_ONLY` and
`serverIntegrationRequired: true`, including successful normalization. Synthetic
tests establish consistency rules, not real approval, authenticity or freshness.

## Required future server checks (not implemented or exercised)

- Authenticate current principal/session; authorize source reads under actual
  scope/grants and independently validate approval actors/decisions/authority
  references. Enforce actual source publication and maker/checker invariants.
- Join Enrollment to learner and ClassOffering, ClassOffering to the approved
  CourseVersion, and all source foreign keys. Validate actual CourseVersion,
  CompletionPolicy and academic-rule approval/effectivity. A role string is not
  a grant and a provided source revision is not proof it is current.
- Obtain a coherent source snapshot and pins from independently read authoritative
  rows. Use immutable row IDs/revisions or canonical projection digests for sources
  without a revision column; do not invent database columns. Detect truncation,
  concurrent changes, stale heads and incomplete correction history. A later
  issuance transaction must revalidate again; S2 implements no such transaction.
- Query W03 evidence directly through a purpose-built read boundary. Never call
  quiz source services that perform expiry sweeps or initialize the application.
- Resolve academic selection/rounding, attendance calculation, entitlement timing,
  transfer/exemption and holds ONLY under explicitly approved applicable rules.
  Missing policies/resolutions remain pending. S2 supplies no numeric defaults,
  attendance denominator, retake choice or effective-time rule engine.
- No integration may connect until a separately authorized W09 environment passes
  Stage A/B. Do not reuse W05B or change its W07 port/directory guard.

## Source mapping and behavior

W03 projections join the submitted activity revision with AssignmentGrade or
TestAttempt and release/audit records. Assignment must be `PUBLISHED`, with
confirmation and independent publication. `REVIEWED_FINAL` alone stays pending.
A submitted quiz needs finalization, publication and its decision as well.
Published actor/time, authority, source revision and normalized value/scale must
match independent records/resolutions. S2 does not select a best/latest attempt
or round/convert a score. A real zero is retained; null is never coerced to zero.

W06 projections represent official learner sessions/windows/receipts, never W08
teacher hours or Meet activity. `ACCEPTED` is a projection classification that
the future boundary must derive from committed official W06Receipt provenance,
not a new Prisma field or a client boolean. Session/window refs, learner and
class/version must match. Approved corrections replay by revision and must have
a complete baseVersion/beforeStatus chain and independent review. Competing
revisions contradict; a missing predecessor stays pending. Pending/rejected
corrections do not override an approved revision. Original receipt refs remain.
No receipt/correction is not automatically an absence. Attendance SATISFIED or
NOT_MET must come from the explicit approved calculation resolution over the
exact selected source-ref set; S2 does not calculate a percentage.

W07 projections join the entitlement event to the exact enrollment/application,
CourseVersion and independently authorized admission decision. Pending-capacity
or blocked-review events cannot establish entitlement. Even an ACTIVE event needs
an explicit applicable validity-rule resolution; ACTIVE-at-issue versus historical
validity, completed classes and transfers are not inferred. An INVALID resolved
outcome is preserved for S1 rather than converted to VALID.

Projections are narrow read contracts, not raw Prisma models or accepted HTTP
DTOs. Incomplete/contradictory input returns PENDING or REJECTED with no evidence.
Only NORMALIZED output has an S1-compatible evidence object. Normalization is
never a certificate eligibility/issuance decision by itself.

STOP after this slice. Actual database provenance, concurrency/HTTP/Chrome,
academic-policy approval and authorization integration remain NOT REACHED.
