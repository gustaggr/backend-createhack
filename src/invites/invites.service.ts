import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InviteStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { dispatchWebhook } from '../common/webhook.util.js';
import { generateOpaqueToken, hashToken } from '../common/token.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WebhookConfigService } from '../webhook-config/webhook-config.service.js';
import type { AcceptInviteDto } from './dto/accept-invite.dto.js';
import type { CreateInviteDto } from './dto/create-invite.dto.js';
import { INVITABLE_ROLES_BY_INSTITUTION_ADMIN, INVITE_TTL_MS } from './invites.constants.js';

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
    private readonly webhookConfig: WebhookConfigService,
  ) {}

  private async assertCanInvite(
    actor: AuthenticatedUser,
    institutionId: string,
    role: Role,
    groupId?: string,
  ) {
    const isSuperAdmin = actor.roles.some((r) => r.role === 'SUPER_ADMIN' && r.status === 'ACTIVE');
    if (isSuperAdmin) return;

    const isInstitutionAdmin = actor.roles.some(
      (r) => r.role === 'INSTITUTION_ADMIN' && r.status === 'ACTIVE' && r.institutionId === institutionId,
    );
    if (isInstitutionAdmin) {
      if (!INVITABLE_ROLES_BY_INSTITUTION_ADMIN.includes(role as never)) {
        throw new ForbiddenException(
          'Administradores de instituição só podem convidar líderes, missionários ou familiares',
        );
      }
      return;
    }

    const isLeader = actor.roles.some(
      (r) => r.role === 'LEADER' && r.status === 'ACTIVE' && r.institutionId === institutionId,
    );
    if (isLeader) {
      if (role !== 'MISSIONARY') {
        throw new ForbiddenException('Líderes só podem convidar membros para o próprio grupo');
      }
      if (!groupId) {
        throw new BadRequestException('Informe o grupo para convidar um membro');
      }
      const group = await this.prisma.group.findFirst({ where: { id: groupId, institutionId } });
      if (!group || group.leaderId !== actor.id) {
        throw new ForbiddenException('Você só pode convidar membros para um grupo que você lidera');
      }
      return;
    }

    throw new ForbiddenException('Você não pode convidar usuários para esta instituição');
  }

  async create(institutionId: string, dto: CreateInviteDto, actor: AuthenticatedUser) {
    await this.assertCanInvite(actor, institutionId, dto.role, dto.groupId);

    const institution = await this.prisma.institution.findUnique({ where: { id: institutionId } });
    if (!institution) {
      throw new NotFoundException('Instituição não encontrada');
    }
    if (institution.status !== 'ACTIVE') {
      throw new BadRequestException('Instituição inativa não pode gerar novos convites');
    }

    if (dto.role === 'MISSIONARY' && dto.groupId) {
      const group = await this.prisma.group.findFirst({
        where: { id: dto.groupId, institutionId, status: 'ACTIVE' },
      });
      if (!group) {
        throw new BadRequestException('Grupo informado não pertence a esta instituição');
      }
    }

    const user = await this.prisma.user.upsert({
      where: { email: dto.email },
      create: { email: dto.email, fullName: dto.fullName },
      update: {},
    });

    const rawToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await this.prisma.invite.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        institutionId,
        groupId: dto.role === 'MISSIONARY' ? dto.groupId : undefined,
        tokenHash: hashToken(rawToken),
        expiresAt,
        createdByUserId: actor.id,
      },
    });

    await this.audit.log({
      actorUserId: actor.id,
      action: 'invite.create',
      entityType: 'Invite',
      entityId: invite.id,
      metadata: { email: dto.email, role: dto.role },
    });

    const activationLink = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/invite/${rawToken}`;
    const webhookEndpoint = await this.webhookConfig.getForDispatch();
    await this.dispatchInviteWebhook(invite.id, webhookEndpoint, {
      link: activationLink,
      email: dto.email,
      fullName: dto.fullName,
      role: dto.role,
      expiresAt: expiresAt.toISOString(),
    });

    // Sem UI de admin nesta rodada: devolvemos o link de ativação na própria resposta
    // para viabilizar o teste ponta a ponta, além do disparo do webhook.
    return { id: invite.id, activationLink, expiresAt, user: { id: user.id, email: user.email } };
  }

  async resend(inviteId: string, actor: AuthenticatedUser) {
    const invite = await this.prisma.invite.findUnique({ where: { id: inviteId } });
    if (!invite) {
      throw new NotFoundException('Convite não encontrado');
    }

    await this.assertCanInvite(actor, invite.institutionId, invite.role, invite.groupId ?? undefined);

    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Somente convites pendentes podem ser reenviados');
    }

    const rawToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { tokenHash: hashToken(rawToken), expiresAt, lastWebhookError: null },
    });

    const activationLink = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/invite/${rawToken}`;
    const webhookEndpoint = await this.webhookConfig.getForDispatch();
    await this.dispatchInviteWebhook(invite.id, webhookEndpoint, {
      link: activationLink,
      email: invite.email,
      fullName: invite.fullName,
      role: invite.role,
      expiresAt: expiresAt.toISOString(),
    });

    await this.audit.log({
      actorUserId: actor.id,
      action: 'invite.resend',
      entityType: 'Invite',
      entityId: invite.id,
    });

    return { activationLink, expiresAt };
  }

  private async dispatchInviteWebhook(
    inviteId: string,
    endpoint: { url: string; secret: string; active: boolean } | null,
    payload: Record<string, unknown>,
  ) {
    if (!endpoint || !endpoint.active) return;

    try {
      await dispatchWebhook(endpoint.url, payload, endpoint.secret);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await this.prisma.invite.update({
        where: { id: inviteId },
        data: { lastWebhookError: message },
      });
      await this.audit.log({
        action: 'invite.webhook.failed',
        entityType: 'Invite',
        entityId: inviteId,
        metadata: { error: message },
      });
    }
  }

  async listByInstitution(institutionId: string, actor: AuthenticatedUser) {
    const isSuperAdmin = actor.roles.some((r) => r.role === 'SUPER_ADMIN' && r.status === 'ACTIVE');
    const isInstitutionAdmin = actor.roles.some(
      (r) => r.role === 'INSTITUTION_ADMIN' && r.status === 'ACTIVE' && r.institutionId === institutionId,
    );
    if (!isSuperAdmin && !isInstitutionAdmin) {
      throw new ForbiddenException('Você não pode ver os convites desta instituição');
    }

    return this.prisma.invite.findMany({
      where: { institutionId },
      include: { group: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByToken(rawToken: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: {
        institution: { select: { displayName: true } },
        group: { select: { name: true } },
      },
    });

    if (!invite) {
      throw new NotFoundException('Convite não encontrado');
    }

    if (invite.status === 'PENDING' && invite.expiresAt < new Date()) {
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED },
      });
      invite.status = InviteStatus.EXPIRED;
    }

    return {
      fullName: invite.fullName,
      email: invite.email,
      role: invite.role,
      institutionName: invite.institution.displayName,
      groupName: invite.group?.name ?? null,
      status: invite.status,
      expiresAt: invite.expiresAt,
    };
  }

  async accept(
    rawToken: string,
    dto: AcceptInviteDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    if (!invite) {
      throw new NotFoundException('Convite não encontrado');
    }
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Este convite já foi utilizado ou não está mais disponível');
    }
    if (invite.expiresAt < new Date()) {
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED },
      });
      throw new BadRequestException('Este convite expirou');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.upsert({
        where: { email: invite.email },
        create: { email: invite.email, fullName: invite.fullName, passwordHash },
        update: { fullName: invite.fullName, passwordHash },
      });

      await tx.userRole.upsert({
        where: {
          userId_institutionId_role: {
            userId: updatedUser.id,
            institutionId: invite.institutionId,
            role: invite.role,
          },
        },
        create: {
          userId: updatedUser.id,
          institutionId: invite.institutionId,
          role: invite.role,
          status: 'ACTIVE',
        },
        update: { status: 'ACTIVE' },
      });

      for (const consent of dto.consents) {
        await tx.consent.create({
          data: {
            userId: updatedUser.id,
            type: consent.type,
            version: consent.version,
            ipAddress: meta.ipAddress,
          },
        });
      }

      if (invite.role === 'MISSIONARY' && invite.groupId) {
        await tx.groupMembership.create({
          data: {
            groupId: invite.groupId,
            missionaryId: updatedUser.id,
            changedByUserId: invite.createdByUserId,
          },
        });
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.ACCEPTED, acceptedAt: new Date() },
      });

      return updatedUser;
    });

    await this.audit.log({
      actorUserId: user.id,
      action: 'invite.accept',
      entityType: 'Invite',
      entityId: invite.id,
      ipAddress: meta.ipAddress,
    });

    const { token, expiresAt } = await this.authService.createSession(user.id, meta);
    const authenticatedUser = await this.authService.getById(user.id);

    return { token, expiresAt, user: authenticatedUser };
  }
}
