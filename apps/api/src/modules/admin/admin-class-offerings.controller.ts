import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ClassOfferingsService } from '../classes/class-offerings.service';
import { CreateClassOfferingDto } from '../classes/dto/create-class-offering.dto';
import { AdminClassOfferingQueryDto } from '../classes/dto/admin-class-offering-query.dto';
import { UpdateClassOfferingDto } from '../classes/dto/update-class-offering.dto';
import { ClassOperationsService } from '../classes/class-operations.service';
import {
  AdminRosterQueryDto,
  AssignInstructorDto,
  CreateScheduleSlotDto,
  InstructorOptionQueryDto,
  UpdateRosterStatusDto,
  UpdateScheduleSlotDto,
} from '../classes/dto/class-operations.dto';

@ApiTags('admin class offerings')
@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/class-offerings')
export class AdminClassOfferingsController {
  constructor(
    private readonly classOfferingsService: ClassOfferingsService,
    private readonly classOperationsService: ClassOperationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all class offerings for administration' })
  list(@Query() query: AdminClassOfferingQueryDto) {
    return this.classOfferingsService.listAdmin(query);
  }

  @Get('instructor-options')
  @ApiOperation({ summary: 'List active instructors available for assignment' })
  instructorOptions(@Query() query: InstructorOptionQueryDto) {
    return this.classOperationsService.listInstructorOptions(query);
  }

  @Put(':id/instructor')
  @ApiOperation({ summary: 'Assign, change, or remove the class instructor' })
  assignInstructor(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: AssignInstructorDto,
  ) {
    return this.classOperationsService.assignInstructor(id, input.instructorId);
  }

  @Get(':id/schedule-slots')
  @ApiOperation({ summary: 'List recurring schedule slots for a class' })
  scheduleSlots(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.classOperationsService.listScheduleSlots(id);
  }

  @Post(':id/schedule-slots')
  @ApiOperation({ summary: 'Add a recurring schedule slot' })
  createScheduleSlot(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: CreateScheduleSlotDto,
  ) {
    return this.classOperationsService.createScheduleSlot(id, input);
  }

  @Patch(':id/schedule-slots/:slotId')
  @ApiOperation({ summary: 'Update a recurring schedule slot' })
  updateScheduleSlot(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('slotId', new ParseUUIDPipe()) slotId: string,
    @Body() input: UpdateScheduleSlotDto,
  ) {
    return this.classOperationsService.updateScheduleSlot(id, slotId, input);
  }

  @Delete(':id/schedule-slots/:slotId')
  @ApiOperation({ summary: 'Delete a recurring schedule slot' })
  deleteScheduleSlot(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('slotId', new ParseUUIDPipe()) slotId: string,
  ) {
    return this.classOperationsService.deleteScheduleSlot(id, slotId);
  }

  @Get(':id/roster')
  @ApiOperation({ summary: 'List and summarize the operational class roster' })
  roster(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: AdminRosterQueryDto) {
    return this.classOperationsService.listRoster(id, query);
  }

  @Patch(':id/roster/:enrollmentId/status')
  @ApiOperation({ summary: 'Apply a restricted administrative roster status transition' })
  updateRosterStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Body() input: UpdateRosterStatusDto,
  ) {
    return this.classOperationsService.updateRosterStatus(id, enrollmentId, input);
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
