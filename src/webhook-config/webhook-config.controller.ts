import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ConfigureWebhookDto } from './dto/configure-webhook.dto.js';
import { WebhookConfigService } from './webhook-config.service.js';

@Controller('webhook-config')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class WebhookConfigController {
  constructor(private readonly webhookConfigService: WebhookConfigService) {}

  @Get()
  get() {
    return this.webhookConfigService.get();
  }

  @Put()
  configure(@Body() dto: ConfigureWebhookDto, @CurrentUser() user: AuthenticatedUser) {
    return this.webhookConfigService.configure(dto.url, user.id);
  }
}
