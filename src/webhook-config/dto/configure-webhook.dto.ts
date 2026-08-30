import { IsUrl } from 'class-validator';

export class ConfigureWebhookDto {
  @IsUrl({ require_tld: false })
  url!: string;
}
