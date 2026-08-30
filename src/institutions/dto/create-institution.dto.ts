import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateInstitutionDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsString()
  @MinLength(1)
  country!: string;

  @IsString()
  @MinLength(1)
  defaultLanguage!: string;

  @IsString()
  @MinLength(1)
  timezone!: string;

  @IsEmail()
  email!: string;
}
