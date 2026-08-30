import { Injectable } from '@nestjs/common';
import { WebhookEvent } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { generateOpaqueToken } from '../common/token.util.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WebhookConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const configs = await this.prisma.webhookConfig.findMany();
    const byEvent = new Map(configs.map((c) => [c.event, c]));
    return Object.values(WebhookEvent).map((event) => {
      const config = byEvent.get(event);
      return config
        ? { event, url: config.url, active: config.active, updatedAt: config.updatedAt }
        : { event, url: null, active: false, updatedAt: null };
    });
  }

  async get(event: WebhookEvent) {
    const config = await this.prisma.webhookConfig.findUnique({ where: { event } });
    if (!config) return null;
    return { url: config.url, active: config.active, updatedAt: config.updatedAt };
  }

  /** Uso interno (dispatch de eventos) — inclui o secret. */
  async getForDispatch(event: WebhookEvent) {
    return this.prisma.webhookConfig.findUnique({ where: { event } });
  }

  async configure(event: WebhookEvent, url: string, actorUserId: string) {
    const secret = generateOpaqueToken();

    const config = await this.prisma.webhookConfig.upsert({
      where: { event },
      create: { event, url, secret, active: true },
      update: { url, secret, active: true },
    });

    await this.audit.log({
      actorUserId,
      action: 'webhook_config.configure',
      entityType: 'WebhookConfig',
      entityId: config.id,
      metadata: { event, url },
    });

    // O secret só é exposto neste momento (criação/rotação) — não fica disponível depois,
    // igual a uma API key. O admin deve copiar e configurar no receptor do webhook agora.
    return { event, url: config.url, active: config.active, secret: config.secret };
  }
}
