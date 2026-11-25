# W10 S5B synthetic Chrome QA boundary

This folder is a test/preview entry, never registered by App.tsx or a production
route. entry.tsx requires a build-only QA constant, exact loopback origin and
server marker. It renders the actual OperationsPage, PublicLayout, AuthNavigation,
Feedback and existing design system. AuthContext/reader are synthetic in-memory
fixtures, not real grants, API responses or server authority.

Installed Node/esbuild/Tailwind compiler and Chrome only; no downloaded package.
run.mjs binds only 127.0.0.1:55831 and uses existing Node CDP/WebSocket transport
on 127.0.0.1:55832 (the installed runner has no pipe transport). No Vite dev server,
app proxy, PostgreSQL or business API. A fixed single-proxy Chrome configuration,
deny CONNECT proxy, host/request allowlist, CSP and CDP request interception
prevent non-QA HTTP access; flags alone are not counted as network evidence.
All served paths are fixed build assets; /api and foreign proxy requests are
denied. Requests/process/listener observations are preserved, including failures.

One supervisor session captures the before batch and waits for one stdin command:
`polish` rebuilds and captures one final batch; `finish` closes the owned session
without a re-run. A finite timeout also tears down only owned resources. Never
re-run startup to obtain a green result, choose another port or kill a pre-existing
process. Baseline/profile identity and OS listener owner checks precede navigation.

Artifacts are private under .local-storage/v2-wave10-s5b-visualqa. Screenshots show
SYNTHETIC DATA — VISUAL QA ONLY. Declared zero is still suppressed by the real
offline W10 projection; never weaken that guard for a prettier screenshot.
Historical tests are not visual acceptance; no runtime/release PASS is implied.

## CF01 offline hardening — NOT execution authority

Bare `node run.mjs` and importing the module do not start a session. A NEW PO
approval and separately reviewed fresh baseline/source pins are required before
any explicit `--execute-reviewed-session --artifact-dir=...` invocation. Only a
new `.local-storage/v2-wave10-s5b-review-<ticket>` sibling is accepted; the old
S5B directory/bundle/receipts are never overwritten. The CLI switch is a technical
accident guard, not proof of PO approval or runtime authentication.

`validate.mjs` only checks Node syntax and parses the PowerShell AST/parameter
schema. It never invokes `os-snapshot.ps1`. Native commands use argument arrays,
shell=false and checked exit/error/signal receipts; no Node -e source rewriting.
Future collection uses fixed -File arguments, not interpolated -Command text.

Pure guard-core.mjs requires context/collector completeness, exact PID generation,
parent/executable/argv, actual server.address()/listening and matching positive
GetNetTCP plus netstat evidence. NULL/0/unknown/contradictory state fails closed,
including extra owned records beyond QA ports. Non-QA loopback/Internet flows,
wildcard/IPv6 listeners and missing process metadata are denied. Raw collector and
bind evidence is persisted before the assertion, even on collection failure.
Cleanup cannot label unknown metadata as closed or kill by profile marker alone.

These sequential OS sources are not atomic: a legitimate transient change may
block a future session. Preserve the conflict and STOP; do not retry, weaken the
guard, reinterpret UNKNOWN or claim a missing historical snapshot was recovered.
CF01 tests use synthetic records and parser-only native processes. No Chrome,
listener, OS network snapshot, database, bundle rebuild or visual PASS in CF01.
