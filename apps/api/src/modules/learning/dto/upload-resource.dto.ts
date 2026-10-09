import { Transform } from 'class-transformer';
import { IsBoolean, IsDefined, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class UploadResourceDto {
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean({ message: 'isDownloadable phải là true hoặc false.' })
  isDownloadable?: boolean;

  @IsOptional()
  @IsUUID('4', { message: 'replaceResourceId phải là UUID hợp lệ.' })
  replaceResourceId?: string;

  @ValidateIf((body: UploadResourceDto) => body.replaceResourceId !== undefined)
  @IsDefined({ message: 'expectedUpdatedAt là bắt buộc khi thay thế tài liệu.' })
  @IsISO8601({}, { message: 'expectedUpdatedAt phải là thời điểm ISO-8601 hợp lệ.' })
  expectedUpdatedAt?: string;
}
