import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WebhookConfigModule } from '../webhook-config/webhook-config.module.js';
import { InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';

@Module({
  imports: [AuthModule, WebhookConfigModule],
  controllers: [InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
