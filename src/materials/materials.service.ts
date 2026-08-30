import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MaterialScope } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { deleteImageKitFile, signUploadAuth } from '../common/imagekit.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateMaterialDto } from './dto/create-material.dto.js';

type AccessLevel = 'ADMIN' | 'LEADER' | 'NONE';

interface MaterialAudienceInput {
  scope: MaterialScope;
  institutionId: string;
  missionaryId: string | null;
  groupId: string | null;
  leaderId: string | null;
}

@Injectable()
export class MaterialsService {
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

  getUploadAuth(institutionId: string, actor: AuthenticatedUser) {
    const access = this.getAccessLevel(actor, institutionId);
    if (access === 'NONE') {
      throw new ForbiddenException('Você não pode enviar materiais para esta instituição');
    }
    return signUploadAuth();
  }

  private async assertLeaderOwnsGroup(groupId: string, institutionId: string, leaderId: string) {
    const group = await this.prisma.group.findFirst({ where: { id: groupId, institutionId } });
    if (!group) throw new NotFoundException('Grupo não encontrado');
    const isOwnLeader = await this.prisma.groupLeader.findUnique({
      where: { groupId_userId: { groupId, userId: leaderId } },
    });
    if (!isOwnLeader) {
      throw new ForbiddenException('Você só pode enviar material para um grupo que você lidera');
    }
  }

  private async assertLeaderOwnsMissionary(missionaryId: string, institutionId: string, leaderId: string) {
    const membership = await this.prisma.groupMembership.findFirst({
      where: {
        missionaryId,
        status: 'ACTIVE',
        group: { institutionId, leaders: { some: { userId: leaderId } } },
      },
    });
    if (!membership) {
      throw new ForbiddenException('Você só pode enviar material para um missionário do seu grupo');
    }
  }

  private async assertMissionaryBelongsToInstitution(missionaryId: string, institutionId: string) {
    const role = await this.prisma.userRole.findFirst({
      where: { userId: missionaryId, institutionId, role: 'MISSIONARY', status: 'ACTIVE' },
    });
    if (!role) {
      throw new NotFoundException('Missionário não encontrado nesta instituição');
    }
  }

  async create(institutionId: string, dto: CreateMaterialDto, actor: AuthenticatedUser) {
    const access = this.getAccessLevel(actor, institutionId);
    if (access === 'NONE') {
      throw new ForbiddenException('Você não pode enviar materiais para esta instituição');
    }

    let missionaryId: string | undefined;
    let groupId: string | undefined;
    let leaderId: string | undefined;

    switch (dto.scope) {
      case 'INDIVIDUAL': {
        if (!dto.missionaryId) throw new BadRequestException('Informe o missionário');
        if (access === 'LEADER') {
          await this.assertLeaderOwnsMissionary(dto.missionaryId, institutionId, actor.id);
        } else {
          await this.assertMissionaryBelongsToInstitution(dto.missionaryId, institutionId);
        }
        missionaryId = dto.missionaryId;
        break;
      }
      case 'GROUP': {
        if (!dto.groupId) throw new BadRequestException('Informe o grupo');
        if (access === 'LEADER') {
          await this.assertLeaderOwnsGroup(dto.groupId, institutionId, actor.id);
        } else {
          const group = await this.prisma.group.findFirst({ where: { id: dto.groupId, institutionId } });
          if (!group) throw new NotFoundException('Grupo não encontrado');
        }
        groupId = dto.groupId;
        break;
      }
      case 'LEADER_ALL': {
        if (access !== 'LEADER') {
          throw new ForbiddenException('Esse alvo é só para líderes');
        }
        leaderId = actor.id;
        break;
      }
      case 'INSTITUTION': {
        if (access !== 'ADMIN') {
          throw new ForbiddenException('Só administradores podem enviar material para toda a instituição');
        }
        break;
      }
    }

    const material = await this.prisma.material.create({
      data: {
        institutionId,
        uploadedByUserId: actor.id,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        fileUrl: dto.fileUrl,
        fileId: dto.fileId,
        thumbnailUrl: dto.thumbnailUrl,
        scope: dto.scope,
        missionaryId,
        groupId,
        leaderId,
      },
    });

    await this.audit.log({
      actorUserId: actor.id,
      action: 'material.create',
      entityType: 'Material',
      entityId: material.id,
      metadata: { scope: dto.scope, type: dto.type },
    });

    return material;
  }

  async list(institutionId: string, actor: AuthenticatedUser) {
    const access = this.getAccessLevel(actor, institutionId);
    if (access === 'NONE') {
      throw new ForbiddenException('Você não pode ver os materiais desta instituição');
    }

    const materials = await this.prisma.material.findMany({
      where: { institutionId, ...(access === 'LEADER' ? { uploadedByUserId: actor.id } : {}) },
      include: {
        missionary: { select: { id: true, fullName: true } },
        group: { select: { id: true, name: true } },
        _count: { select: { views: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      materials.map(async (m) => ({
        ...m,
        audienceSize: (await this.resolveAudienceMissionaryIds(m)).length,
      })),
    );
  }

  private async findOwned(materialId: string, actor: AuthenticatedUser) {
    const material = await this.prisma.material.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException('Material não encontrado');

    const access = this.getAccessLevel(actor, material.institutionId);
    if (access === 'NONE' || (access === 'LEADER' && material.uploadedByUserId !== actor.id)) {
      throw new ForbiddenException('Você não pode gerenciar este material');
    }
    return material;
  }

  async remove(materialId: string, actor: AuthenticatedUser) {
    const material = await this.findOwned(materialId, actor);

    await this.prisma.material.delete({ where: { id: materialId } });

    try {
      await deleteImageKitFile(material.fileId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await this.audit.log({
        actorUserId: actor.id,
        action: 'material.imagekit_delete.failed',
        entityType: 'Material',
        entityId: materialId,
        metadata: { error: message },
      });
    }

    await this.audit.log({
      actorUserId: actor.id,
      action: 'material.delete',
      entityType: 'Material',
      entityId: materialId,
    });

    return { success: true };
  }

  /** Missionários que deveriam ver este material, dado o escopo — usado tanto
   * pra "quem já viu" (líder) quanto pra checar visibilidade antes de marcar
   * como visto (missionário). */
  private async resolveAudienceMissionaryIds(material: MaterialAudienceInput): Promise<string[]> {
    switch (material.scope) {
      case 'INDIVIDUAL':
        return material.missionaryId ? [material.missionaryId] : [];
      case 'GROUP': {
        if (!material.groupId) return [];
        const memberships = await this.prisma.groupMembership.findMany({
          where: { groupId: material.groupId, status: 'ACTIVE' },
          select: { missionaryId: true },
        });
        return memberships.map((m) => m.missionaryId);
      }
      case 'LEADER_ALL': {
        if (!material.leaderId) return [];
        const groups = await this.prisma.group.findMany({
          where: {
            leaders: { some: { userId: material.leaderId } },
            institutionId: material.institutionId,
          },
          select: { id: true },
        });
        const memberships = await this.prisma.groupMembership.findMany({
          where: { groupId: { in: groups.map((g) => g.id) }, status: 'ACTIVE' },
          select: { missionaryId: true },
          distinct: ['missionaryId'],
        });
        return memberships.map((m) => m.missionaryId);
      }
      case 'INSTITUTION': {
        const roles = await this.prisma.userRole.findMany({
          where: { institutionId: material.institutionId, role: 'MISSIONARY', status: 'ACTIVE' },
          select: { userId: true },
        });
        return roles.map((r) => r.userId);
      }
      default:
        return [];
    }
  }

  async getViewers(materialId: string, actor: AuthenticatedUser) {
    const material = await this.findOwned(materialId, actor);

    const audienceIds = await this.resolveAudienceMissionaryIds(material);
    if (audienceIds.length === 0) return [];

    const [users, views] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: audienceIds } },
        select: { id: true, fullName: true },
      }),
      this.prisma.materialView.findMany({
        where: { materialId, userId: { in: audienceIds } },
      }),
    ]);

    const viewedByUserId = new Map(views.map((v) => [v.userId, v.viewedAt]));

    return users.map((u) => ({
      missionaryId: u.id,
      fullName: u.fullName,
      viewed: viewedByUserId.has(u.id),
      viewedAt: viewedByUserId.get(u.id) ?? null,
    }));
  }

  private activeMissionaryInstitutionIds(actor: AuthenticatedUser): string[] {
    return actor.roles
      .filter((r) => r.role === 'MISSIONARY' && r.status === 'ACTIVE' && r.institutionId)
      .map((r) => r.institutionId as string);
  }

  private async missionaryVisibilityContext(missionaryId: string, institutionIds: string[]) {
    const memberships = await this.prisma.groupMembership.findMany({
      where: { missionaryId, status: 'ACTIVE', group: { institutionId: { in: institutionIds } } },
      include: { group: { select: { id: true, leaders: { select: { userId: true } } } } },
    });
    return {
      groupIds: memberships.map((m) => m.group.id),
      leaderIds: Array.from(new Set(memberships.flatMap((m) => m.group.leaders.map((l) => l.userId)))),
    };
  }

  async listMine(actor: AuthenticatedUser) {
    const institutionIds = this.activeMissionaryInstitutionIds(actor);
    if (institutionIds.length === 0) {
      throw new ForbiddenException('Você não tem um papel de missionário ativo');
    }

    const { groupIds, leaderIds } = await this.missionaryVisibilityContext(actor.id, institutionIds);

    const materials = await this.prisma.material.findMany({
      where: {
        institutionId: { in: institutionIds },
        OR: [
          { scope: 'INDIVIDUAL', missionaryId: actor.id },
          { scope: 'GROUP', groupId: { in: groupIds } },
          { scope: 'LEADER_ALL', leaderId: { in: leaderIds } },
          { scope: 'INSTITUTION' },
        ],
      },
      include: { views: { where: { userId: actor.id } } },
      orderBy: { createdAt: 'desc' },
    });

    return materials.map((m) => ({
      id: m.id,
      type: m.type,
      title: m.title,
      description: m.description,
      fileUrl: m.fileUrl,
      thumbnailUrl: m.thumbnailUrl,
      scope: m.scope,
      createdAt: m.createdAt,
      viewed: m.views.length > 0,
      viewedAt: m.views[0]?.viewedAt ?? null,
    }));
  }

  async markViewed(materialId: string, actor: AuthenticatedUser) {
    const institutionIds = this.activeMissionaryInstitutionIds(actor);
    if (institutionIds.length === 0) {
      throw new ForbiddenException('Você não tem um papel de missionário ativo');
    }

    const material = await this.prisma.material.findUnique({ where: { id: materialId } });
    if (!material || !institutionIds.includes(material.institutionId)) {
      throw new NotFoundException('Material não encontrado');
    }

    const { groupIds, leaderIds } = await this.missionaryVisibilityContext(actor.id, institutionIds);
    const visible =
      (material.scope === 'INDIVIDUAL' && material.missionaryId === actor.id) ||
      (material.scope === 'GROUP' && !!material.groupId && groupIds.includes(material.groupId)) ||
      (material.scope === 'LEADER_ALL' && !!material.leaderId && leaderIds.includes(material.leaderId)) ||
      material.scope === 'INSTITUTION';
    if (!visible) {
      throw new ForbiddenException('Você não tem acesso a este material');
    }

    await this.prisma.materialView.upsert({
      where: { materialId_userId: { materialId, userId: actor.id } },
      create: { materialId, userId: actor.id },
      update: {},
    });

    return { success: true };
  }
}
