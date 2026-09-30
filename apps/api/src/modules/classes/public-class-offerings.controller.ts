import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ClassOfferingsService } from './class-offerings.service';

@ApiTags('class offerings')
@Public()
@Controller('class-offerings')
export class PublicClassOfferingsController {
  constructor(private readonly classOfferingsService: ClassOfferingsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get public-safe ClassOffering detail' })
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.classOfferingsService.getPublicById(id);
  }
}
