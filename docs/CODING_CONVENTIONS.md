# Coding Conventions v0.1

## TypeScript

- `strict: true`.
- Do not use `any` unless documented at an external boundary.
- Prefer explicit DTOs/types over untyped objects.
- Business rules belong in services/domain logic, not React components/controllers.

## NestJS

- Controller: HTTP boundary only.
- Service: application/business logic.
- DTO: request/response validation contract.
- Guard: authentication/authorization boundary.
- Prisma access should be wrapped in a service/repository boundary when the module grows.

## React

- Pages compose features/components; do not place API/business logic directly in page JSX.
- API calls go through `src/lib/api-client.ts` or feature-specific API modules.
- Route authorization in the frontend is UX only; backend authorization remains mandatory.

## Database

- Migration-first changes after the initial local database is ready.
- Do not edit production schema manually.
- Do not use `prisma db push` as the production baseline.
- Every uniqueness/foreign-key rule from the ERD should eventually exist in DB and/or application rules.

## AI-assisted coding

For AI-generated code, the author must still verify:

1. Does it match the approved module boundary?
2. Does authorization run on the backend?
3. Does it add hidden dependencies or new infrastructure?
4. Are error/fallback cases handled?
5. Is there a test for the important rule?
6. Can both team members explain the implementation in the defense?
