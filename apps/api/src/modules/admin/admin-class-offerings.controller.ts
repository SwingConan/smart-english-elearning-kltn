import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ClassOfferingsService } from '../classes/class-offerings.service';
import { CreateClassOfferingDto } from '../classes/dto/create-class-offering.dto';
import { AdminClassOfferingQueryDto } from '../classes/dto/admin-class-offering-query.dto';
import { UpdateClassOfferingDto } from '../classes/dto/update-class-offering.dto';

@ApiTags('admin class offerings')
@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/class-offerings')
export class AdminClassOfferingsController {
  constructor(private readonly classOfferingsService: ClassOfferingsService) {}

  @Get()
  @ApiOperation({ summary: 'List all class offerings for administration' })
  list(@Query() query: AdminClassOfferingQueryDto) {
    return this.classOfferingsService.listAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one class offering for administration' })
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.classOfferingsService.getAdminById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a class offering' })
  create(@Body() input: CreateClassOfferingDto) {
    return this.classOfferingsService.create(input);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an allowed set of class offering fields' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: UpdateClassOfferingDto) {
    return this.classOfferingsService.update(id, input);
  }
}
