import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  locality?: string;

  /** Zero, um ou vários líderes — um grupo pode não ter liderança designada. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leaderIds?: string[];
}
