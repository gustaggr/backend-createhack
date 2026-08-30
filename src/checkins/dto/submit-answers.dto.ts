import { Type } from 'class-transformer';
import { ArrayMinSize, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

export class AnswerInputDto {
  @IsString()
  questionId!: string;

  @IsOptional()
  @IsIn(['A', 'B', 'C', 'D'])
  selectedOption?: 'A' | 'B' | 'C' | 'D';

  @IsOptional()
  @IsString()
  textAnswer?: string;
}

export class SubmitAnswersDto {
  @ValidateNested({ each: true })
  @Type(() => AnswerInputDto)
  @ArrayMinSize(1)
  answers!: AnswerInputDto[];
}
