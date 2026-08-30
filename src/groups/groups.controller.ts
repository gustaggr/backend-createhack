import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateGroupDto } from './dto/create-group.dto.js';
import { UpdateGroupDto } from './dto/update-group.dto.js';
import { GroupsService } from './groups.service.js';

@Controller()
@UseGuards(SessionAuthGuard, RolesGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post('institutions/:institutionId/groups')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN)
  create(
    @Param('institutionId') institutionId: string,
    @Body() dto: CreateGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groupsService.create(institutionId, dto, user.id);
  }

  @Get('institutions/:institutionId/groups')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  listByInstitution(
    @Param('institutionId') institutionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groupsService.listByInstitution(institutionId, user);
  }

  @Get('institutions/:institutionId/groups/:groupId')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  findOne(@Param('groupId') groupId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.findById(groupId, user);
  }

  @Patch('institutions/:institutionId/groups/:groupId')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  update(
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groupsService.update(groupId, dto, user);
  }
}
