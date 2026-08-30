import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, Delete } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateInstitutionDto } from './dto/create-institution.dto.js';
import { UpdateInstitutionDto } from './dto/update-institution.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { InstitutionsService } from './institutions.service.js';

@Controller('institutions')
@UseGuards(SessionAuthGuard, RolesGuard)
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN)
  create(@Body() dto: CreateInstitutionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.institutionsService.create(dto, user.id);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN)
  list() {
    return this.institutionsService.list();
  }

  @Get(':institutionId')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN)
  findOne(@Param('institutionId') institutionId: string) {
    return this.institutionsService.findById(institutionId);
  }

  @Get(':institutionId/members')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN)
  listMembers(
    @Param('institutionId') institutionId: string,
    @Query('role') role?: 'INSTITUTION_ADMIN' | 'LEADER' | 'MISSIONARY',
  ) {
    return this.institutionsService.listMembers(institutionId, role);
  }

  @Patch(':institutionId')
  @Roles(Role.SUPER_ADMIN)
  update(
    @Param('institutionId') institutionId: string,
    @Body() dto: UpdateInstitutionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.update(institutionId, dto, user.id);
  }

  @Patch(':institutionId/members/:userId')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  updateMember(
    @Param('institutionId') institutionId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.updateMember(institutionId, userId, dto, user.id);
  }

  @Delete(':institutionId/members/:userId')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  removeMember(
    @Param('institutionId') institutionId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.removeMember(institutionId, userId, user.id);
  }
}
