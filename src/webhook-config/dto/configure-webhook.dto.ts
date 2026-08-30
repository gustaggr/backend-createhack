import { WebhookEvent } from '@prisma/client';
import { IsEnum, IsUrl } from 'class-validator';

export class ConfigureWebhookDto {
  @IsEnum(WebhookEvent)
  event!: WebhookEvent;

  @IsUrl({ require_tld: false })
  url!: string;
}
