import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateInstitutionDto } from './dto/create-institution.dto.js';
import type { UpdateInstitutionDto } from './dto/update-institution.dto.js';

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
        user: { select: { id: true, fullName: true, email: true, preferredName: true } },
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
}
