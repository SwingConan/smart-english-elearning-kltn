# Smart English E-Learning KLTN

Project Skeleton v0.1 for the approved Tech Stack v0.2.

## 1. Approved baseline

- Frontend: React 19 + Vite 8 + TypeScript + React Router 8
- UI: Tailwind CSS 4 + shadcn/ui
- Backend: Node.js 22 LTS + NestJS 12 + Express adapter + TypeScript
- API: REST + Swagger/OpenAPI
- Database: PostgreSQL 18
- ORM: Prisma ORM 7
- Authentication baseline: server-side session + secure HttpOnly cookie + Argon2id
- BKT/Adaptive: pure TypeScript domain services
- Repository: npm workspaces (`apps/web` + `apps/api`)
- Background queue: DEFERRED (BullMQ + Redis/Valkey only when needed)
- Payment: CANDIDATE

## 2. Repository structure

```text
.
├── apps/
│   ├── web/                  # React/Vite SPA
│   └── api/                  # NestJS modular monolith
├── docs/
├── scripts/
├── .github/workflows/        # CI template only until package-lock exists
├── package.json
└── README.md
```

## 3. Before first install

Both team members should verify:

```bash
node -v
npm -v
git --version
```

Expected Node version for this baseline:

```text
v22.22.3 or newer on Node 22.x
```

Do not use Node 23/25/current releases for the thesis environment.

## 4. First-time setup

From the repository root:

```bash
npm install
```

This creates `package-lock.json`. Commit that lockfile so both machines install the same dependency graph.

Then create environment files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Windows PowerShell equivalent:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Update `apps/api/.env` with your local PostgreSQL connection string.

## 5. Prisma foundation

Generate Prisma Client:

```bash
npm run prisma:generate
npm run prisma:validate
```

The skeleton intentionally includes only the first identity foundation model (`User`).
Do **not** dump all 39 ERD entities into the first migration. Add models by vertical slice so the code, migration, API and tests evolve together.

When local PostgreSQL is ready:

```bash
npm run prisma:migrate -- --name init_identity
```

## 6. Run locally

Terminal A:

```bash
npm run dev:api
```

Terminal B:

```bash
npm run dev:web
```

Or run both:

```bash
npm run dev
```

Expected URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/health`

The Vite dev server proxies `/api` to NestJS, so the browser can call `/api/*` without hard-coding backend URLs during local development.

## 7. Quality commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run format:check
npm run check:skeleton
```

## 8. shadcn/ui

The Vite/Tailwind aliases and `components.json` are already prepared.
After dependencies are installed and internet access is available, add the first component from `apps/web`:

```bash
npx shadcn@latest add button
```

Do not generate dozens of UI components before a screen needs them.

## 9. Git workflow

Do not work directly on `main`.

Example:

```bash
git checkout main
git pull
git checkout -b chore/project-skeleton
```

After local validation:

```bash
git add .
git commit -m "chore: initialize project skeleton"
git push -u origin chore/project-skeleton
```

Then open a Pull Request.

## 10. First vertical slice after skeleton

The next implementation slice is:

```text
Auth foundation
→ Public Catalog
→ Course/Class/Enrollment
```

BKT/Adaptive comes after the basic LMS path is stable. Payment and background queue are not implemented in this skeleton.

## 11. Important scope guards

- BKT must remain deterministic and independent from LLM.
- AI grading result is a suggestion; Instructor confirms Final Grade.
- Never store secrets in the frontend or commit `.env`.
- Backend is the source of truth for RBAC/ownership/business rules.
- Do not add microservices, Redis, WebRTC, DKT, or payment integration merely because the tooling exists.
