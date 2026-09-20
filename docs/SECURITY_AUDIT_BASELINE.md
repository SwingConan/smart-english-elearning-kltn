# Dependency Security Audit Baseline

Date: 2026-09-19

## Audit summary

- 9 high-severity package-level findings
- 0 critical findings
- No confirmed non-breaking remediation is available for the current tested dependency graph.

This document records the review baseline. It does not claim that the findings are not exploitable.

## NestJS / Multer

- NestJS `11.2.5` and `@nestjs/platform-express` `11.2.5` pull `multer@2.2.0` into the API runtime graph.
- The underlying Multer fixes require `multer >=2.3.0`.
- npm audit currently proposes NestJS 12 as the graph-level remediation. That is a breaking change outside the tested NestJS 11 baseline.
- The current skeleton has no file-upload endpoint, `MulterModule`, or Multer interceptor.
- The absence of an upload endpoint must not be interpreted as proof that the finding is not exploitable.
- Revisit this chain before implementing any file-upload feature.

## Prisma

- Prisma `7.10.0` pulls findings through the `deepmerge-ts` and `mysql2` dependency chains.
- Application runtime uses PostgreSQL through the Prisma PostgreSQL adapter and does not use MySQL directly.
- These findings primarily reside in Prisma CLI, configuration, and tooling dependencies.
- npm audit proposes Prisma `6.19.3`, which is a major downgrade and is incompatible with the tested Prisma 7 baseline.
- Revisit these findings when Prisma 7.x updates the relevant transitive dependencies.

## Policy

```text
Do not run npm audit fix --force.
Do not change major framework/ORM versions solely to obtain audit=0.
Review security findings before production deployment.
Review Multer chain before adding file upload.
```

## VS01 close-out — 2026-09-20

The VS01 close-out retains the original 2026-09-19 audit history. The current
recorded npm audit summary is:

- 0 critical
- 9 high
- 0 moderate
- 0 low

The advisories remain present. No verified non-breaking remediation has been
adopted for the tested dependency graph.

### Dependency-chain context

- **NestJS / Multer:** the current NestJS 11 Express dependency graph includes
  the Multer findings described above. VS01 has no upload endpoint, but this
  does not establish that the advisories cannot be exploited. Re-review the
  chain before adding file upload.
- **Prisma tooling / `deepmerge-ts` / `mysql2`:** VS01 uses PostgreSQL, not
  MySQL, while the affected packages occur primarily in Prisma tooling/config
  dependency paths. The advisories still remain and must be revisited when a
  compatible Prisma 7 update or another verified non-breaking remediation is
  available.

### Deferred deployment and security work

These items are **deferred**, not implemented guarantees:

- CSRF-token protection is deferred under the current same-site SPA and
  `SameSite=Lax` cookie assumption. Reassess that assumption when deployment
  topology or cross-site integrations change.
- Configure and validate `trust proxy` before deploying secure session cookies
  behind a production reverse proxy.
- Add authentication rate limiting as part of production hardening.
- Re-review the Multer advisory chain before any file-upload capability is
  implemented.

Do not run `npm audit fix --force`, and do not change major framework or ORM
versions solely to make the audit count zero.
