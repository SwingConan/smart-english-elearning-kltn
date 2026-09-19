# Project Skeleton v0.1 - Checklist

## Repository

- [ ] Node 22.22.3+ installed on both machines
- [ ] `npm install` completed
- [ ] `package-lock.json` generated and committed
- [ ] `.env` remains ignored
- [ ] existing `.githooks/pre-push` verified

## Frontend

- [ ] Vite dev server starts
- [ ] React Router renders `/`, `/catalog`, `/login`, role placeholders
- [ ] `/status` can call `/api/health`
- [ ] Tailwind styles render
- [ ] shadcn/ui config exists; add components only when needed

## Backend

- [ ] Nest API starts
- [ ] `/api/health` returns HTTP 200
- [ ] `/docs` opens Swagger
- [ ] ValidationPipe is enabled
- [ ] domain modules load without circular dependency

## Database

- [ ] PostgreSQL connection string configured
- [ ] `npm run prisma:generate` passes
- [ ] `npm run prisma:validate` passes
- [ ] initial migration created only after local DB is ready

## Quality

- [ ] lint passes
- [ ] typecheck passes
- [ ] unit tests pass
- [ ] build passes
- [ ] skeleton check passes

## GitHub

- [ ] work is on `chore/project-skeleton`
- [ ] Pull Request opened
- [ ] CI template renamed to `ci.yml` only after `package-lock.json` is committed and local checks pass
