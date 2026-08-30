import { GroupStatus } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  locality?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leaderIds?: string[];

  @IsOptional()
  @IsEnum(GroupStatus)
  status?: GroupStatus;
}
