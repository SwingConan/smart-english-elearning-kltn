import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { SessionModule } from './infrastructure/session/session.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CoursesModule } from './modules/courses/courses.module';
import { ClassesModule } from './modules/classes/classes.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { LearningModule } from './modules/learning/learning.module';
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { AdaptiveModule } from './modules/adaptive/adaptive.module';
import { EssayGradingModule } from './modules/essay-grading/essay-grading.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { VirtualClassroomModule } from './modules/virtual-classroom/virtual-classroom.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SessionModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    ClassesModule,
    EnrollmentsModule,
    LearningModule,
    AssessmentsModule,
    AdaptiveModule,
    EssayGradingModule,
    EngagementModule,
    ConsultationsModule,
    VirtualClassroomModule,
    CertificatesModule,
    AdminModule,
  ],
})
export class AppModule {}
