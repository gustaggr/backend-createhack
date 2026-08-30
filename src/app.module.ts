import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CheckinsModule } from './checkins/checkins.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { InstitutionsModule } from './institutions/institutions.module.js';
import { InvitesModule } from './invites/invites.module.js';
import { MaterialsModule } from './materials/materials.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { WebhookConfigModule } from './webhook-config/webhook-config.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    InstitutionsModule,
    GroupsModule,
    WebhookConfigModule,
    InvitesModule,
    CheckinsModule,
    MaterialsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
