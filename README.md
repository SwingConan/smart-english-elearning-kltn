# Smart English E-Learning KLTN

Modular-monolith thesis project with an npm-workspaces Web/API monorepo.

## Implemented vertical slices

VS01 implements this end-to-end path:

```text
Auth -> Public Catalog -> Course/ClassOffering -> Enrollment
```

The VS01 data subset is `User`, `UserSession`, `Course`,
`ClassOffering`, and `Enrollment`. It includes server-side PostgreSQL sessions,
student registration/login, public course discovery, coordinator course and
class-offering management, and student enrollment views.

VS02 adds core learning delivery:

```text
Assigned instructor -> Module -> Lesson -> LearningResource
ACTIVE student enrollment -> LessonProgress -> Course progress
```

Instructors can manage content for assigned courses, including arrow-based
ordering of modules, lessons, and URL-based resources. Students with an
`ACTIVE` enrollment can browse the course structure, open and complete lessons,
use lesson resources, and view lesson-completion-based course progress.

Not implemented yet: payment confirmation, instructor lookup or reassignment
UI, file upload/object storage, quiz/test flows, BKT/Adaptive behavior, AI
grading, engagement analytics, certificates, or virtual classrooms.

## Tested baseline

- Node.js 22.22.3
- npm 12.0.2
- React + TypeScript + Vite 7.3.6
- NestJS 11 with the Express adapter
- PostgreSQL (local development tested with PostgreSQL 14)
- Prisma 7.10.0
- Server-side PostgreSQL sessions with an HttpOnly `sel.sid` cookie
- Argon2id password hashing

Use the exact npm version: npm 10.9.8 encountered an Arborist resolver failure
with this dependency graph. The production PostgreSQL version is not locked by
this statement.

## Repository structure

```text
.
|-- apps/
|   |-- web/                   # React/Vite SPA
|   `-- api/                   # NestJS modular monolith and Prisma
|-- docs/
|-- scripts/
|-- .github/workflows/ci.yml
|-- package.json
`-- README.md
```

## Local setup

Verify the required tooling before installing:

```bash
node --version
npm --version
```

Expected versions are Node `v22.22.3` and npm `12.0.2`. Install dependencies
from the repository root:

```bash
npm install
```

Use `npm ci` for a clean lockfile-based installation, including in CI.

Create the ignored API environment file from its safe template:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Configure separate local `DATABASE_URL` and `SHADOW_DATABASE_URL` values, plus
a strong `SESSION_SECRET`. Do not commit local environment files or connection
credentials.

Generate and validate Prisma Client, then apply development migrations:

```bash
npm run prisma:generate
npm run prisma:validate
npm run prisma:migrate
```

To create a new migration deliberately:

```bash
npm run prisma:migrate -- --name <migration_name>
```

### Development seed

`SEED_DEFAULT_PASSWORD` is required in the ignored `apps/api/.env` before
running:

```bash
npm run prisma:seed
```

The seed is development-only, idempotent through stable identifiers, updates
the demo-user hashes from the current local password, and is blocked when
`NODE_ENV=production`. The repository does not contain a real demo password.

## Run locally

Start the API and Web independently:

```bash
npm run dev:api
npm run dev:web
```

Or start both workspaces:

```bash
npm run dev
```

Local defaults:

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/health`

The Vite development server proxies `/api` to the NestJS API.

## Validation commands

Run from the repository root:

```bash
npm run check:skeleton
npm run lint
npm run typecheck
npm run test
npm run test:e2e --workspace=@smart-elearning/api
npm run build
```

Current automated baseline: 10 API unit suites / 89 tests, 6 API E2E suites /
16 tests, and 8 Web test files / 63 tests (168 tests total).

## Security and design boundaries

- Backend guards and ownership checks are the authorization boundary; frontend
  route guards provide user experience only.
- Registration does not create a login session. Login creates a server-side
  session, and logout destroys it.
- Pricing belongs to `ClassOffering`, not `Course`.
- FREE enrollment becomes `ACTIVE`; PAID enrollment becomes
  `PENDING_PAYMENT`, which is not active learning access.
- VS02 learning access requires an `ACTIVE` enrollment; other enrollment
  statuses are denied without disclosing another learner's resources.
- Learning resources are URL-based. `isDownloadable` controls business/UI
  behavior and is not cryptographic download protection.
- Never commit `.env` files, passwords, session secrets, or connection URLs.
- See `docs/SECURITY_AUDIT_BASELINE.md` for the current dependency findings and
  deferred production-hardening work.

## Git workflow

Work on a feature branch, run the validation commands, and open a Pull Request.
Do not work directly on `main`, force-push shared work, or use audit fixes that
change the tested dependency baseline without review.
