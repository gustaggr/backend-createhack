import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { generateOpaqueToken } from '../common/token.util.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WebhookConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get() {
    const config = await this.prisma.webhookConfig.findFirst();
    if (!config) return null;
    return { url: config.url, active: config.active, updatedAt: config.updatedAt };
  }

  /** Uso interno (dispatch de convites) — inclui o secret. */
  async getForDispatch() {
    return this.prisma.webhookConfig.findFirst();
  }

  async configure(url: string, actorUserId: string) {
    const existing = await this.prisma.webhookConfig.findFirst();
    const secret = generateOpaqueToken();

    const config = existing
      ? await this.prisma.webhookConfig.update({
          where: { id: existing.id },
          data: { url, secret, active: true },
        })
      : await this.prisma.webhookConfig.create({ data: { url, secret, active: true } });

    await this.audit.log({
      actorUserId,
      action: 'webhook_config.configure',
      entityType: 'WebhookConfig',
      entityId: config.id,
      metadata: { url },
    });

    // O secret só é exposto neste momento (criação/rotação) — não fica disponível depois,
    // igual a uma API key. O admin deve copiar e configurar no receptor do webhook agora.
    return { url: config.url, active: config.active, secret: config.secret };
  }
}
