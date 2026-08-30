import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { InstitutionStatus } from '@prisma/client';

export class UpdateInstitutionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  country?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  defaultLanguage?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  timezone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(InstitutionStatus)
  status?: InstitutionStatus;
}
