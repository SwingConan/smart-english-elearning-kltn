import { Prisma } from '../../generated/prisma/client';

export const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  phoneNumber: true,
  role: true,
  status: true,
} satisfies Prisma.UserSelect;

type SelectedPublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;
export type PublicUser = Omit<SelectedPublicUser, 'phoneNumber'> & { phoneNumber?: string | null };

export const userCredentialsSelect = {
  ...publicUserSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect;

export type UserCredentials = Omit<
  Prisma.UserGetPayload<{
    select: typeof userCredentialsSelect;
  }>,
  'phoneNumber'
> & { phoneNumber?: string | null };
