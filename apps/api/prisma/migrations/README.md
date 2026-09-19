# Prisma migrations

No migration is committed in the generated skeleton because this environment does not have the team's PostgreSQL instance.

After both machines have the approved Node version and a local/managed PostgreSQL database:

```bash
npm run prisma:generate
npm run prisma:validate
npm run prisma:migrate -- --name init_identity
```

Review the generated SQL before committing it.
