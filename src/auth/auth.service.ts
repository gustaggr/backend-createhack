import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service.js';
import { generateOpaqueToken, hashToken } from '../common/token.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SESSION_TTL_MS } from './auth.constants.js';
import type { AuthenticatedUser } from './auth.types.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

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
  phone: string | null;
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
    phone: user.phone,
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

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const dataToUpdate: any = {};

    if (dto.fullName) dataToUpdate.fullName = dto.fullName;
    if (dto.preferredName !== undefined) dataToUpdate.preferredName = dto.preferredName;
    if (dto.phone !== undefined) dataToUpdate.phone = dto.phone || null;

    if (dto.newPassword) {
      if (!dto.currentPassword) {
        throw new UnauthorizedException('A senha atual é necessária para definir uma nova senha');
      }

      if (user.passwordHash) {
        const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
        if (!valid) {
          throw new UnauthorizedException('Senha atual incorreta');
        }
      }

      dataToUpdate.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    }

    if (Object.keys(dataToUpdate).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: dataToUpdate,
      });

      await this.audit.log({
        actorUserId: userId,
        action: 'auth.profile.update',
        entityType: 'User',
        entityId: userId,
      });
    }

    return this.getById(userId) as Promise<AuthenticatedUser>;
  }
}
