import { ServiceUnavailableException } from '@nestjs/common';

export function pilotTaskPolicy(taskCode: string | null) {
  if (taskCode === 'SE_SW_01_W5_V01') {
    throw new ServiceUnavailableException({
      code: 'ITEM_VERSION_RETIRED',
      message: 'Phiên bản câu hỏi không còn được sử dụng.',
    });
  }
  return taskCode === 'SE_SW_01_S10_V01'
    ? {
        kind: 'DOUBLE_PROMPT_THEN_RECORD' as const,
        version: 1 as const,
        plays: 2 as const,
        responseSeconds: 30 as const,
      }
    : null;
}
