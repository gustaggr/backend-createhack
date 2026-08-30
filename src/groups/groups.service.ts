import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateGroupDto } from './dto/create-group.dto.js';
import type { UpdateGroupDto } from './dto/update-group.dto.js';

type AccessLevel = 'ADMIN' | 'LEADER' | 'NONE';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private getAccessLevel(actor: AuthenticatedUser, institutionId: string): AccessLevel {
    const isSuperAdmin = actor.roles.some((r) => r.role === 'SUPER_ADMIN' && r.status === 'ACTIVE');
    if (isSuperAdmin) return 'ADMIN';

    const isInstitutionAdmin = actor.roles.some(
      (r) => r.role === 'INSTITUTION_ADMIN' && r.status === 'ACTIVE' && r.institutionId === institutionId,
    );
    if (isInstitutionAdmin) return 'ADMIN';

    const isLeader = actor.roles.some(
      (r) => r.role === 'LEADER' && r.status === 'ACTIVE' && r.institutionId === institutionId,
    );
    if (isLeader) return 'LEADER';

    return 'NONE';
  }

  /** Aceita uma lista vazia — um grupo pode não ter nenhum líder designado
   * (ex.: um grupo puramente institucional, "da escola"). */
  private async assertLeadersBelongToInstitution(institutionId: string, leaderIds: string[]) {
    if (leaderIds.length === 0) return;

    const leaderRoles = await this.prisma.userRole.findMany({
      where: { userId: { in: leaderIds }, institutionId, role: 'LEADER', status: 'ACTIVE' },
      select: { userId: true },
    });
    const validIds = new Set(leaderRoles.map((r) => r.userId));
    const invalid = leaderIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException('Um ou mais líderes informados não pertencem a esta instituição');
    }
  }

  async create(institutionId: string, dto: CreateGroupDto, actorUserId: string) {
    const leaderIds = dto.leaderIds ?? [];
    await this.assertLeadersBelongToInstitution(institutionId, leaderIds);

    const group = await this.prisma.group.create({
      data: {
        institutionId,
        name: dto.name,
        description: dto.description,
        locality: dto.locality,
        leaders: { create: leaderIds.map((userId) => ({ userId })) },
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'group.create',
      entityType: 'Group',
      entityId: group.id,
      metadata: { name: dto.name, leaderIds },
    });

    return group;
  }

  async listByInstitution(institutionId: string, actor: AuthenticatedUser) {
    const access = this.getAccessLevel(actor, institutionId);
    if (access === 'NONE') {
      throw new ForbiddenException('Você não pode ver os grupos desta instituição');
    }

    const groups = await this.prisma.group.findMany({
      where: {
        institutionId,
        ...(access === 'LEADER' ? { leaders: { some: { userId: actor.id } } } : {}),
      },
      include: {
        leaders: { include: { user: { select: { id: true, fullName: true } } } },
        _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      locality: g.locality,
      status: g.status,
      leaders: g.leaders.map((l) => l.user),
      memberCount: g._count.memberships,
    }));
  }

  async findById(groupId: string, actor: AuthenticatedUser) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        leaders: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        memberships: {
          where: { status: 'ACTIVE' },
          include: { missionary: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    const access = this.getAccessLevel(actor, group.institutionId);
    const isOwnLeader = group.leaders.some((l) => l.userId === actor.id);
    if (access === 'NONE' || (access === 'LEADER' && !isOwnLeader)) {
      throw new ForbiddenException('Você não pode ver este grupo');
    }

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      locality: group.locality,
      status: group.status,
      leaders: group.leaders.map((l) => l.user),
      members: group.memberships.map((m) => m.missionary),
      canManageLeaders: access === 'ADMIN',
    };
  }

  async update(groupId: string, dto: UpdateGroupDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { leaders: true },
    });
    if (!existing) {
      throw new NotFoundException('Grupo não encontrado');
    }

    const access = this.getAccessLevel(actor, existing.institutionId);
    const isOwnLeader = existing.leaders.some((l) => l.userId === actor.id);
    if (access === 'NONE' || (access === 'LEADER' && !isOwnLeader)) {
      throw new ForbiddenException('Você não pode editar este grupo');
    }

    if (access === 'LEADER' && (dto.leaderIds !== undefined || dto.status)) {
      throw new ForbiddenException(
        'Líderes só podem editar nome, descrição e localidade do grupo',
      );
    }

    if (dto.leaderIds !== undefined) {
      await this.assertLeadersBelongToInstitution(existing.institutionId, dto.leaderIds);
    }

    const { leaderIds, ...rest } = dto;

    const group = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.group.update({ where: { id: groupId }, data: rest });

      if (leaderIds !== undefined) {
        const previousIds = existing.leaders.map((l) => l.userId);
        await tx.groupLeader.deleteMany({
          where: { groupId, userId: { notIn: leaderIds } },
        });
        for (const userId of leaderIds) {
          await tx.groupLeader.upsert({
            where: { groupId_userId: { groupId, userId } },
            create: { groupId, userId },
            update: {},
          });
        }

        if (JSON.stringify([...previousIds].sort()) !== JSON.stringify([...leaderIds].sort())) {
          await this.audit.log({
            actorUserId: actor.id,
            action: 'group.leaders_changed',
            entityType: 'Group',
            entityId: groupId,
            metadata: { previousLeaderIds: previousIds, newLeaderIds: leaderIds },
          });
        }
      }

      return updated;
    });

    await this.audit.log({
      actorUserId: actor.id,
      action: 'group.update',
      entityType: 'Group',
      entityId: group.id,
      metadata: { ...rest },
    });

    return group;
  }
}
