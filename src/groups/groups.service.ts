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

  private async assertLeaderBelongsToInstitution(institutionId: string, leaderId: string) {
    const leaderRole = await this.prisma.userRole.findFirst({
      where: { userId: leaderId, institutionId, role: 'LEADER', status: 'ACTIVE' },
    });
    if (!leaderRole) {
      throw new BadRequestException('Líder informado não pertence a esta instituição');
    }
  }

  async create(institutionId: string, dto: CreateGroupDto, actorUserId: string) {
    await this.assertLeaderBelongsToInstitution(institutionId, dto.leaderId);

    const group = await this.prisma.group.create({
      data: {
        institutionId,
        leaderId: dto.leaderId,
        name: dto.name,
        description: dto.description,
        locality: dto.locality,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'group.create',
      entityType: 'Group',
      entityId: group.id,
      metadata: { name: dto.name, leaderId: dto.leaderId },
    });

    return group;
  }

  async listByInstitution(institutionId: string, actor: AuthenticatedUser) {
    const access = this.getAccessLevel(actor, institutionId);
    if (access === 'NONE') {
      throw new ForbiddenException('Você não pode ver os grupos desta instituição');
    }

    const groups = await this.prisma.group.findMany({
      where: { institutionId, ...(access === 'LEADER' ? { leaderId: actor.id } : {}) },
      include: {
        leader: { select: { id: true, fullName: true } },
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
      leader: g.leader,
      memberCount: g._count.memberships,
    }));
  }

  async findById(groupId: string, actor: AuthenticatedUser) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        leader: { select: { id: true, fullName: true, email: true } },
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
    if (access === 'NONE' || (access === 'LEADER' && group.leaderId !== actor.id)) {
      throw new ForbiddenException('Você não pode ver este grupo');
    }

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      locality: group.locality,
      status: group.status,
      leader: group.leader,
      members: group.memberships.map((m) => m.missionary),
      canReassignLeader: access === 'ADMIN',
    };
  }

  async update(groupId: string, dto: UpdateGroupDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!existing) {
      throw new NotFoundException('Grupo não encontrado');
    }

    const access = this.getAccessLevel(actor, existing.institutionId);
    if (access === 'NONE' || (access === 'LEADER' && existing.leaderId !== actor.id)) {
      throw new ForbiddenException('Você não pode editar este grupo');
    }

    if (access === 'LEADER' && (dto.leaderId || dto.status)) {
      throw new ForbiddenException(
        'Líderes só podem editar nome, descrição e localidade do grupo',
      );
    }

    if (dto.leaderId) {
      await this.assertLeaderBelongsToInstitution(existing.institutionId, dto.leaderId);
    }

    const group = await this.prisma.group.update({ where: { id: groupId }, data: dto });

    if (dto.leaderId && dto.leaderId !== existing.leaderId) {
      await this.audit.log({
        actorUserId: actor.id,
        action: 'group.leader_changed',
        entityType: 'Group',
        entityId: group.id,
        metadata: { previousLeaderId: existing.leaderId, newLeaderId: dto.leaderId },
      });
    }

    await this.audit.log({
      actorUserId: actor.id,
      action: 'group.update',
      entityType: 'Group',
      entityId: group.id,
      metadata: { ...dto },
    });

    return group;
  }
}
