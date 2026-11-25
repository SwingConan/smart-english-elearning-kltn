import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class CmsDraftDto {
  @IsUUID() scopeId!: string;
  @IsString() @MinLength(3) @MaxLength(160) title!: string;
  @IsString() @MinLength(1) @MaxLength(20000) body!: string;
  @IsString() @MinLength(3) @MaxLength(300) sourceReference!: string;
  @IsOptional() @Matches(/^[a-z0-9][a-z0-9-]{2,119}$/) slug?: string;
}
export class CmsRevisionCommandDto {
  @IsUUID() scopeId!: string;
  @IsInt() @Min(0) expectedVersion!: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20000) body?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(300) sourceReference?: string;
}
