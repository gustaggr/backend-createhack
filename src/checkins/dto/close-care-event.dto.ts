import { IsOptional, IsString } from 'class-validator';

export class CloseCareEventDto {
  @IsOptional()
  @IsString()
  closingNote?: string;
}
