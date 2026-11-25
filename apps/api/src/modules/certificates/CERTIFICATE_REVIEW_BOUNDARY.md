# W09-DF-S4A certificate review guards

The two pure functions simulate review eligibility and a future issuer preflight.
They consume scoped S3A assessment contracts/S1 results and do not load services,
authenticate a user, persist a review, issue a certificate or authorize an API.
No module registration, controller, Prisma schema or migration is changed.

## Inputs and checks

Each read retains the exact learner/Enrollment/ClassOffering/CourseVersion/policy
request binding. S3A's result alone lacks learnerId, so the enclosing binding must
be independently established by future server integration, not copied from a DTO.
Candidate and current manifests plus criterion evidence revisions must agree.
Actual source changes that reuse all pins remain undetectable offline.

S1 validates the approved CourseVersion/policy, applicability and rule definitions.
Unknown academic rules, missing approved policy, mandatory pending/failed evidence,
inconsistent summaries and unverified exemptions block review. No thresholds,
retake selection, denominator, effective entitlement time or exemption is invented.
An approved hold-rule reference and complete same-scope/read-manifest hold result
are required; an absent rule or unknown/conflicting hold does not mean clear.
This models a future approved hold resolution, without defining current open hold
and appeal policy. Missing actual policies remain blocked in real integration.

Actors must have an explicit class-scoped review or issue grant, an authenticated
session and primary role ACADEMIC_MANAGER (HVU). No role grants a capability by
itself. Grant provenance must identify independent approval and authority, with
validity resolved by the future server, not a client clock. Selection/current
principal, canonical person, session, grant revision, decision and authority epoch
must agree. Expired/revoked/unknown or foreign grants fail closed.

Review eligibility does not require an issuer to be selected first. Future issue
preflight requires a prior approved same-scope/same-manifest review, its reviewer
still authorized and a distinct authorized issuer. Compare both account ID and
canonical person ID: two sessions/accounts for the same actual human do not
satisfy separation. PriorCertificateReview is an input contract, not a persistent
review model or a producer of actual approvals.

## Trust and integration limit

Every output is OFFLINE_AUTHORIZATION_SIMULATION_ONLY, runtimeAuthorized=false,
requiresServerVerification=true, including SIMULATED_ELIGIBLE. AUTHORIZED,
ACTIVE, VALID, APPROVED and fixture references are consistency inputs, not
authenticated provenance. Client approved:true / SERVER_VERIFIED flags cannot
upgrade assurance. A forged S3A runtimeVerified claim is rejected. These functions
must not be mounted as standalone API authorization guards or treated as a grant.

Future separately authorized integration must authenticate server session and
canonical human identity, read verified live grants/approval authority, coherent
policy/evidence/hold revisions and independent prior-review lineage, and fence
revocation/source races at the eventual operation boundary. Real server grant
verification is NOT implemented by a TypeScript type, source marker or this slice.
S3B database integration remains blocked; S4A does not close that blocker.

There is no wall clock or age/grace default. Freshness means explicit exact
revision/epoch comparison within the supplied read contract; actual snapshot
correctness and completeness require runtime verification. No unique-active DB
constraint, idempotent issuance, lifecycle, PDF, UI or real grants are implemented.

## Verification and rollback

Focused offline tests use labeled synthetic rules and principals, including
same-person/different-account separation, revoked/foreign grants, stale policy and
evidence, incomplete/unknown holds, forged summary/verification flags and a genuine
denied S3A in-memory-reader output. Existing 163 W09 tests remain unchanged.

Only four new files in this module are added. No S1-S3A edit is required. A future
authorized rollback can remove these four additions after preserving evidence;
there is no database rollback. Current results and preservation receipts are in
the private consolidated S4A/cross-wave handoff, not a runtime PASS claim.

STOP for GPT Web Batch Review. No automatic next slice, PostgreSQL action or
external packet sharing; all release gates remain false.
