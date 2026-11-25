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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { PublicUser } from '../users/user.types';
import { AcademicService } from './academic.service';
import {
  AcademicQueryDto,
  AcademicReasonDto,
  DraftClassDto,
  DraftProgramDto,
  DraftSlotDto,
  GenerateRoadmapDto,
  PublishToggleDto,
  RemoveDraftSlotDto,
  SaveCourseCurriculumDto,
  SaveRoadmapDto,
  SetupClassDto,
  UpdateDraftClassDto,
  UpdateDraftProgramDto,
} from './academic.dto';
@Controller('v2/academic')
@Roles('ACADEMIC_MANAGER')
export class AcademicController {
  constructor(private readonly service: AcademicService) {}
  @Get('programs') programs(@CurrentUser() u: PublicUser, @Query() q: AcademicQueryDto) {
    return this.service.programs(u, q);
  }
  @Get('programs/:id') program(
    @CurrentUser() u: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.program(u, id);
  }
  @Post('programs') createProgram(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Body() body: DraftProgramDto,
  ) {
    return this.service.createProgram({ id: u.id, sessionId: req.sessionID }, body);
  }
  @Patch('programs/:id') updateProgram(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateDraftProgramDto,
  ) {
    return this.service.updateProgram({ id: u.id, sessionId: req.sessionID }, id, body);
  }
  @Get('classes')
  @Roles('ACADEMIC_MANAGER', 'INSTRUCTOR', 'STUDENT')
  classes(@CurrentUser() u: PublicUser, @Query() q: AcademicQueryDto) {
    return this.service.classes(u, q);
  }
  @Get('classes/:id')
  @Roles('ACADEMIC_MANAGER', 'INSTRUCTOR', 'STUDENT')
  classroom(@CurrentUser() u: PublicUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.classroom(u, id);
  }
  @Get('classes/:id/roster')
  @Roles('ACADEMIC_MANAGER', 'INSTRUCTOR', 'STUDENT')
  roster(
    @CurrentUser() u: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: AcademicQueryDto,
  ) {
    return this.service.roster(u, id, q);
  }
  @Post('classes') createClass(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Body() body: DraftClassDto,
  ) {
    return this.service.createClass({ id: u.id, sessionId: req.sessionID }, body);
  }
  @Patch('classes/:id') updateClass(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateDraftClassDto,
  ) {
    return this.service.updateClass({ id: u.id, sessionId: req.sessionID }, id, body);
  }
  @Post('classes/:id/weekly-templates') addSlot(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: DraftSlotDto,
  ) {
    return this.service.saveSlot({ id: u.id, sessionId: req.sessionID }, id, body);
  }
  @Patch('classes/:id/weekly-templates/:slotId') updateSlot(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('slotId', new ParseUUIDPipe()) slotId: string,
    @Body() body: DraftSlotDto,
  ) {
    return this.service.saveSlot({ id: u.id, sessionId: req.sessionID }, id, body, slotId);
  }
  @Delete('classes/:id/weekly-templates/:slotId') removeSlot(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('slotId', new ParseUUIDPipe()) slotId: string,
    @Body() body: RemoveDraftSlotDto,
  ) {
    return this.service.removeSlot({ id: u.id, sessionId: req.sessionID }, id, slotId, body);
  }
  @Put('programs/:id/curriculum') saveCurriculum(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SaveCourseCurriculumDto,
  ) {
    return this.service.saveCurriculum({ id: u.id, sessionId: req.sessionID }, id, body);
  }
  @Post('programs/:id/publish') publishProgram(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PublishToggleDto,
  ) {
    return this.service.publishProgram({ id: u.id, sessionId: req.sessionID }, id, body);
  }
  @Patch('classes/:id/setup') setupClass(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SetupClassDto,
  ) {
    return this.service.setupClass({ id: u.id, sessionId: req.sessionID }, u, id, body);
  }
  @Post('classes/:id/roadmap/generate') generateRoadmap(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: GenerateRoadmapDto,
  ) {
    return this.service.generateRoadmap({ id: u.id, sessionId: req.sessionID }, u, id, body);
  }
  @Put('classes/:id/roadmap') saveRoadmap(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SaveRoadmapDto,
  ) {
    return this.service.saveRoadmap({ id: u.id, sessionId: req.sessionID }, u, id, body);
  }
  @Post('classes/:id/sync-lms-sections') syncLmsSections(
    @CurrentUser() u: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Partial<AcademicReasonDto>,
  ) {
    return this.service.syncLmsSections({ id: u.id, sessionId: req.sessionID }, id, body?.reason);
  }
}
