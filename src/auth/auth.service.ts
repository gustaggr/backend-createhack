import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service.js';
import { generateOpaqueToken, hashToken } from '../common/token.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SESSION_TTL_MS } from './auth.constants.js';
import type { AuthenticatedUser } from './auth.types.js';

const userWithRolesInclude = {
  roles: {
    include: { institution: true },
  },
} as const;

function toAuthenticatedUser(user: {
  id: string;
  email: string;
  fullName: string;
  preferredName: string | null;
  roles: Array<{
    id: string;
    role: string;
    status: string;
    institutionId: string | null;
    institution: { displayName: string } | null;
  }>;
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    preferredName: user.preferredName,
    roles: user.roles.map((r) => ({
      id: r.id,
      role: r.role as AuthenticatedUser['roles'][number]['role'],
      status: r.status as AuthenticatedUser['roles'][number]['status'],
      institutionId: r.institutionId,
      institutionName: r.institution?.displayName ?? null,
    })),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async login(
    email: string,
    password: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<{ token: string; expiresAt: Date; user: AuthenticatedUser }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: userWithRolesInclude,
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const { token, expiresAt } = await this.createSession(user.id, meta);

    await this.audit.log({
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
    });

    return { token, expiresAt, user: toAuthenticatedUser(user) };
  }

  async createSession(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  async logout(token: string, actorUserId?: string) {
    const tokenHash = hashToken(token);
    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (actorUserId) {
      await this.audit.log({
        actorUserId,
        action: 'auth.logout',
        entityType: 'User',
        entityId: actorUserId,
      });
    }
  }

  async validateSessionToken(token: string): Promise<AuthenticatedUser | null> {
    const tokenHash = hashToken(token);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: userWithRolesInclude } },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }

    return toAuthenticatedUser(session.user);
  }

  async getById(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userWithRolesInclude,
    });
    return user ? toAuthenticatedUser(user) : null;
  }
}
