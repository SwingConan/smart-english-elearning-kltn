import { Equals, IsBoolean, IsUUID } from 'class-validator';
export class MicrophoneUploadDto {
  @IsUUID() idempotencyKey!: string;
}
export class MicrophoneConfirmDto extends MicrophoneUploadDto {
  @IsBoolean() @Equals(true) physicalDeviceConfirmed!: boolean;
  @IsBoolean() @Equals(true) originalPlaybackConfirmed!: boolean;
}
