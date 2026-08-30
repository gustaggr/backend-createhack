import { MaterialScope, MaterialType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateMaterialDto {
  @IsEnum(MaterialType)
  type!: MaterialType;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(MaterialScope)
  scope!: MaterialScope;

  @IsOptional()
  @IsString()
  missionaryId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsUrl({ require_tld: false })
  fileUrl!: string;

  @IsString()
  @IsNotEmpty()
  fileId!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  thumbnailUrl?: string;
}
