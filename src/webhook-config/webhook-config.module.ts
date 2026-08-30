import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WebhookConfigController } from './webhook-config.controller.js';
import { WebhookConfigService } from './webhook-config.service.js';

@Module({
  imports: [AuthModule],
  controllers: [WebhookConfigController],
  providers: [WebhookConfigService],
  exports: [WebhookConfigService],
})
export class WebhookConfigModule {}
