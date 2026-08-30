import type { Role, UserRoleStatus } from '@prisma/client';

export interface AuthenticatedUserRole {
  id: string;
  role: Role;
  status: UserRoleStatus;
  institutionId: string | null;
  institutionName: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  preferredName: string | null;
  phone: string | null;
  roles: AuthenticatedUserRole[];
}
