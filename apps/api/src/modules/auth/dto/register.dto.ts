import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  @Transform(({ obj }) => (obj as Record<string, unknown>)?.termsAccepted, {
    toClassOnly: true,
  })
  @IsBoolean({
    message: 'Vui lòng đồng ý điều khoản sử dụng và chính sách bảo mật dữ liệu.',
  })
  @Equals(true, {
    message: 'Vui lòng đồng ý điều khoản sử dụng và chính sách bảo mật dữ liệu.',
  })
  termsAccepted: boolean;
}
