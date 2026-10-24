import { Module } from '@nestjs/common';
import { VirtualClassroomController } from './virtual-classroom.controller';
import { VirtualClassroomService } from './virtual-classroom.service';

@Module({ controllers: [VirtualClassroomController], providers: [VirtualClassroomService] })
export class VirtualClassroomModule {}
