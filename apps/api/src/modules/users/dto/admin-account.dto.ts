import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole, UserStatus } from '../../../generated/prisma/client';

export class AdminAccountQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(320)
  search?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class CreateStaffAccountDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsEnum(UserRole)
  @IsIn([UserRole.INSTRUCTOR, UserRole.ADMIN_COORDINATOR])
  role!: Extract<UserRole, 'INSTRUCTOR' | 'ADMIN_COORDINATOR'>;
}

export class UpdateAccountRoleDto {
  @IsEnum(UserRole)
  @IsIn([UserRole.INSTRUCTOR, UserRole.ADMIN_COORDINATOR])
  role!: Extract<UserRole, 'INSTRUCTOR' | 'ADMIN_COORDINATOR'>;
}

export class UpdateAccountStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
