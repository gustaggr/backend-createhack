import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateInstitutionDto } from './dto/create-institution.dto.js';
import type { UpdateInstitutionDto } from './dto/update-institution.dto.js';
import type { UpdateMemberDto } from './dto/update-member.dto.js';

@Injectable()
export class InstitutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.institution.findMany({ orderBy: { name: 'asc' } });
  }

  async listMembers(institutionId: string, role?: 'INSTITUTION_ADMIN' | 'LEADER' | 'MISSIONARY') {
    await this.findById(institutionId);

    const userRoles = await this.prisma.userRole.findMany({
      where: {
        institutionId,
        status: 'ACTIVE',
        role: role ? role : { in: ['LEADER', 'MISSIONARY'] },
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, preferredName: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const missionaryIds = userRoles.filter((r) => r.role === 'MISSIONARY').map((r) => r.user.id);
    const memberships = missionaryIds.length
      ? await this.prisma.groupMembership.findMany({
          where: { missionaryId: { in: missionaryIds }, status: 'ACTIVE' },
          include: { group: { select: { id: true, name: true } } },
        })
      : [];
    const groupByMissionaryId = new Map(memberships.map((m) => [m.missionaryId, m.group]));

    return userRoles.map((r) => ({
      userId: r.user.id,
      fullName: r.user.fullName,
      preferredName: r.user.preferredName,
      email: r.user.email,
      phone: r.user.phone,
      role: r.role,
      group: r.role === 'MISSIONARY' ? (groupByMissionaryId.get(r.user.id) ?? null) : undefined,
    }));
  }

  async create(dto: CreateInstitutionDto, actorUserId: string) {
    const institution = await this.prisma.institution.create({ data: dto });

    await this.audit.log({
      actorUserId,
      action: 'institution.create',
      entityType: 'Institution',
      entityId: institution.id,
    });

    return institution;
  }

  async findById(id: string) {
    const institution = await this.prisma.institution.findUnique({ where: { id } });

    if (!institution) {
      throw new NotFoundException('Instituição não encontrada');
    }

    return institution;
  }

  async update(id: string, dto: UpdateInstitutionDto, actorUserId: string) {
    await this.findById(id);

    const institution = await this.prisma.institution.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      actorUserId,
      action: 'institution.update',
      entityType: 'Institution',
      entityId: institution.id,
      metadata: { ...dto },
    });

    return institution;
  }

  private async checkMemberAccess(institutionId: string, targetUserId: string, actorUserId: string) {
    const actorRoles = await this.prisma.userRole.findMany({
      where: { userId: actorUserId, status: 'ACTIVE' },
    });

    if (actorRoles.some((r) => r.role === 'SUPER_ADMIN')) return true;

    if (actorRoles.some((r) => r.institutionId === institutionId && r.role === 'INSTITUTION_ADMIN')) return true;

    const isLeader = actorRoles.some((r) => r.institutionId === institutionId && r.role === 'LEADER');
    if (isLeader) {
      const targetMemberships = await this.prisma.groupMembership.findMany({
        where: { missionaryId: targetUserId, status: 'ACTIVE', group: { institutionId } },
        include: { group: { include: { leaders: true } } },
      });
      const isInActorsGroup = targetMemberships.some((m) =>
        m.group.leaders.some((l) => l.userId === actorUserId),
      );
      if (!isInActorsGroup) {
        throw new ForbiddenException('Você não tem permissão para editar este membro.');
      }
      return true;
    }

    throw new ForbiddenException('Você não tem permissão para editar este membro.');
  }

  async updateMember(institutionId: string, targetUserId: string, dto: UpdateMemberDto, actorUserId: string) {
    await this.checkMemberAccess(institutionId, targetUserId, actorUserId);
    
    const targetRole = await this.prisma.userRole.findFirst({
      where: { userId: targetUserId, institutionId, status: 'ACTIVE' },
    });
    if (!targetRole) throw new NotFoundException('Membro não encontrado nesta instituição');

    const dataToUpdate: any = {};
    if (dto.fullName) dataToUpdate.fullName = dto.fullName;
    if (dto.email) dataToUpdate.email = dto.email;
    if (dto.phone !== undefined) dataToUpdate.phone = dto.phone || null;
    if (dto.password) {
      dataToUpdate.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (Object.keys(dataToUpdate).length > 0) {
      await this.prisma.user.update({
        where: { id: targetUserId },
        data: dataToUpdate,
      });
    }

    await this.audit.log({
      actorUserId,
      action: 'institution.member.update',
      entityType: 'User',
      entityId: targetUserId,
      metadata: { institutionId },
    });

    return { success: true };
  }

  async removeMember(institutionId: string, targetUserId: string, actorUserId: string) {
    await this.checkMemberAccess(institutionId, targetUserId, actorUserId);

    const targetRole = await this.prisma.userRole.findFirst({
      where: { userId: targetUserId, institutionId, status: 'ACTIVE' },
    });
    if (!targetRole) throw new NotFoundException('Membro não encontrado nesta instituição');

    await this.prisma.userRole.updateMany({
      where: { userId: targetUserId, institutionId, status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    });

    const groups = await this.prisma.group.findMany({ where: { institutionId } });
    const groupIds = groups.map((g) => g.id);

    if (groupIds.length > 0) {
      await this.prisma.groupMembership.updateMany({
        where: { missionaryId: targetUserId, groupId: { in: groupIds }, status: 'ACTIVE' },
        data: { status: 'ENDED', endDate: new Date(), changedByUserId: actorUserId },
      });
    }

    await this.audit.log({
      actorUserId,
      action: 'institution.member.remove',
      entityType: 'User',
      entityId: targetUserId,
      metadata: { institutionId },
    });

    return { success: true };
  }
}
