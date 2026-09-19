import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../modules/auth/decorators/public.decorator';

@ApiTags('system')
@Public()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'API health check' })
  getHealth() {
    return {
      status: 'ok',
      service: 'smart-english-elearning-api',
      timestamp: new Date().toISOString(),
    };
  }
}
