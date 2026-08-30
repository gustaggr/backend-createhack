import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CheckinsModule } from './checkins/checkins.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { InstitutionsModule } from './institutions/institutions.module.js';
import { InvitesModule } from './invites/invites.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { WebhookConfigModule } from './webhook-config/webhook-config.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'backend-createhack',
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    InstitutionsModule,
    GroupsModule,
    WebhookConfigModule,
    InvitesModule,
    CheckinsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
