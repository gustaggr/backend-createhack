import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { BibleService } from '../bible/bible.service.js';
import { CheckinsService } from './checkins.service.js';
import { CloseCareEventDto } from './dto/close-care-event.dto.js';
import { SubmitAnswersDto } from './dto/submit-answers.dto.js';

function missionaryInstitutionId(user: AuthenticatedUser): string {
  const role = user.roles.find((r) => r.role === 'MISSIONARY' && r.status === 'ACTIVE');
  if (!role?.institutionId) {
    throw new ForbiddenException('Você não tem um papel de missionário ativo');
  }
  return role.institutionId;
}

@Controller()
@UseGuards(SessionAuthGuard, RolesGuard)
export class CheckinsController {
  constructor(
    private readonly checkinsService: CheckinsService,
    private readonly bibleService: BibleService,
  ) {}

  @Get('checkins/today')
  @Roles(Role.MISSIONARY)
  getToday(@CurrentUser() user: AuthenticatedUser) {
    return this.checkinsService.getToday(user.id);
  }

  @Post('checkins/today/answers')
  @Roles(Role.MISSIONARY)
  submitAnswers(
    @Body() dto: SubmitAnswersDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.checkinsService.submitAnswers(user.id, missionaryInstitutionId(user), dto, {
      ipAddress: req.ip,
    });
  }

  @Get('checkins/streak')
  @Roles(Role.MISSIONARY)
  getStreak(@CurrentUser() user: AuthenticatedUser) {
    return this.checkinsService.getStreak(user.id);
  }

  @Get('verse-of-the-day')
  getVerseOfTheDay() {
    return this.bibleService.getVerseOfTheDay();
  }

  @Get('institutions/:institutionId/groups/:groupId/checkins-today')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  getGroupCheckinsToday(
    @Param('institutionId') institutionId: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checkinsService.getGroupCheckinsToday(institutionId, groupId, user);
  }

  @Get('institutions/:institutionId/missionaries/:missionaryId/profile')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  getMissionaryProfile(
    @Param('institutionId') institutionId: string,
    @Param('missionaryId') missionaryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.checkinsService.getMissionaryProfile(institutionId, missionaryId, user, { from, to });
  }

  @Get('dashboard/leader-overview')
  @Roles(Role.LEADER)
  getLeaderOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.checkinsService.getLeaderOverview(user);
  }

  @Get('institutions/:institutionId/dashboard-overview')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN)
  getInstitutionOverview(
    @Param('institutionId') institutionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checkinsService.getInstitutionOverview(institutionId, user);
  }

  @Get('dashboard/platform-overview')
  @Roles(Role.SUPER_ADMIN)
  getPlatformOverview() {
    return this.checkinsService.getPlatformOverview();
  }

  @Delete('institutions/:institutionId/checkins/:checkinId')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  deleteCheckin(
    @Param('institutionId') institutionId: string,
    @Param('checkinId') checkinId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checkinsService.deleteCheckin(institutionId, checkinId, user);
  }

  @Get('institutions/:institutionId/care-events')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  listCareEvents(@Param('institutionId') institutionId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.checkinsService.listCareEvents(institutionId, user);
  }

  @Patch('care-events/:careEventId/close')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTION_ADMIN, Role.LEADER)
  closeCareEvent(
    @Param('careEventId') careEventId: string,
    @Body() dto: CloseCareEventDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checkinsService.closeCareEvent(careEventId, dto.closingNote ?? '', user);
  }
}
