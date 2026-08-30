import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BibleModule } from '../bible/bible.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { WebhookConfigModule } from '../webhook-config/webhook-config.module.js';
import { CheckinsController } from './checkins.controller.js';
import { CheckinsService } from './checkins.service.js';

@Module({
  imports: [AuthModule, BibleModule, GroupsModule, WebhookConfigModule],
  controllers: [CheckinsController],
  providers: [CheckinsService],
})
export class CheckinsModule {}
