import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateMaterialDto } from './dto/create-material.dto.js';
import { MaterialsService } from './materials.service.js';

@Controller()
@UseGuards(SessionAuthGuard, RolesGuard)
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post('institutions/:institutionId/materials/upload-auth')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  getUploadAuth(@Param('institutionId') institutionId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.materialsService.getUploadAuth(institutionId, user);
  }

  @Post('institutions/:institutionId/materials')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  create(
    @Param('institutionId') institutionId: string,
    @Body() dto: CreateMaterialDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialsService.create(institutionId, dto, user);
  }

  @Get('institutions/:institutionId/materials')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  list(@Param('institutionId') institutionId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.materialsService.list(institutionId, user);
  }

  @Delete('institutions/:institutionId/materials/:materialId')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  remove(@Param('materialId') materialId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.materialsService.remove(materialId, user);
  }

  @Get('institutions/:institutionId/materials/:materialId/viewers')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  getViewers(@Param('materialId') materialId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.materialsService.getViewers(materialId, user);
  }

  @Get('materials/mine')
  @Roles(Role.MISSIONARY)
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.materialsService.listMine(user);
  }

  @Post('materials/:materialId/view')
  @Roles(Role.MISSIONARY)
  markViewed(@Param('materialId') materialId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.materialsService.markViewed(materialId, user);
  }
}
