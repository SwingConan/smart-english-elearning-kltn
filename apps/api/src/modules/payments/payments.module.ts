import { Module } from '@nestjs/common';
import { AdminPaymentsController, StudentPaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [StudentPaymentsController, AdminPaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
