import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { setSessionCookie } from '../auth/auth.controller.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AcceptInviteDto } from './dto/accept-invite.dto.js';
import { CreateInviteDto } from './dto/create-invite.dto.js';
import { InvitesService } from './invites.service.js';

@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('institutions/:institutionId/invites')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  create(
    @Param('institutionId') institutionId: string,
    @Body() dto: CreateInviteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invitesService.create(institutionId, dto, user);
  }

  @Get('institutions/:institutionId/invites')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN)
  listByInstitution(
    @Param('institutionId') institutionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invitesService.listByInstitution(institutionId, user);
  }

  @Post('invites/:inviteId/resend')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  resend(@Param('inviteId') inviteId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invitesService.resend(inviteId, user);
  }

  @Get('invites/:token')
  findByToken(@Param('token') token: string) {
    return this.invitesService.findByToken(token);
  }

  @Post('invites/:token/accept')
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptInviteDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token: sessionToken, user } = await this.invitesService.accept(token, dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    setSessionCookie(res, sessionToken);
    return { user };
  }
}
