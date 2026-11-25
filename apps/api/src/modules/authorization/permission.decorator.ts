import { SetMetadata } from '@nestjs/common';
import type { Capability } from './permission.policy';
export const PERMISSION_KEY = 'v2.permission';
export const Permission = (capability: Capability) => SetMetadata(PERMISSION_KEY, capability);
