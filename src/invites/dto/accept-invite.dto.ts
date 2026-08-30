import { Type } from 'class-transformer';
import { ArrayMinSize, IsEnum, IsString, MinLength, ValidateNested } from 'class-validator';
import { ConsentType } from '@prisma/client';

export class ConsentInputDto {
  @IsEnum(ConsentType)
  type!: ConsentType;

  @IsString()
  @MinLength(1)
  version!: string;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  password!: string;

  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  @ArrayMinSize(1)
  consents!: ConsentInputDto[];
}
