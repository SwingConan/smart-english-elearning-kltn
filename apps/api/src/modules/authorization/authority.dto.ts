import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CAPABILITIES } from './permission.policy';
import { Transform } from 'class-transformer';
export class ReasonDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
export class GrantRequestDto extends ReasonDto {
  @IsUUID() userId!: string;
  @IsIn(CAPABILITIES) capability!: string;
  @IsIn(['GLOBAL', 'CLASS', 'COURSE','SUPPORT_TOPIC', 'TEACHER']) scopeType!: 'GLOBAL' | 'CLASS' | 'COURSE' | 'SUPPORT_TOPIC' | 'TEACHER';
  @IsOptional() @IsString() @MaxLength(64) scopeId?: string;
  @IsDateString() effectiveAt!: string;
  @IsDateString() expiresAt!: string;
}
export class RoleRequestDto extends ReasonDto {
  @IsUUID() userId!: string;
  @IsIn([
    'INSTRUCTOR',
    'COUNSELOR',
    'ACADEMIC_MANAGER',
    'CASHIER',
    'TEACHING_INSPECTOR',
    'SYSTEM_ADMIN',
  ])
  nextRole!:
    | 'INSTRUCTOR'
    | 'COUNSELOR'
    | 'ACADEMIC_MANAGER'
    | 'CASHIER'
    | 'TEACHING_INSPECTOR'
    | 'SYSTEM_ADMIN';
}
