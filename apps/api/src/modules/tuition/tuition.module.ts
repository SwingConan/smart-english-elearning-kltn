import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { TuitionPaymentService } from './tuition-payment.service';

@Global()
@Module({
  imports: [PrismaModule, AuthorizationModule],
  providers: [TuitionPaymentService],
  exports: [TuitionPaymentService],
})
export class TuitionModule {}
