import { Prisma } from '../../generated/prisma/client';

export const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

export const userCredentialsSelect = {
  ...publicUserSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect;

export type UserCredentials = Prisma.UserGetPayload<{
  select: typeof userCredentialsSelect;
}>;
