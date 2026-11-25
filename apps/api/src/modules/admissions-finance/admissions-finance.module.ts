import { Module } from '@nestjs/common';
import { AdmissionsFinanceController } from './admissions-finance.controller';
import { AdmissionsFinanceService } from './admissions-finance.service';
import { W07ProofStorage } from './admissions-finance.storage';
import { SePayController } from './sepay.controller';
import { SePayService } from './sepay.service';
import { SePayConfiguration } from './sepay.config';
import { SePayBankCheckService } from './sepay-bank-check.service';
import { ClassLmsModule } from '../class-lms/class-lms.module';
import { TuitionModule } from '../tuition/tuition.module';
@Module({
  imports: [ClassLmsModule, TuitionModule],
  controllers: [AdmissionsFinanceController, SePayController],
  exports: [AdmissionsFinanceService],
  providers: [AdmissionsFinanceService, W07ProofStorage, SePayService, SePayConfiguration, SePayBankCheckService],
})
export class AdmissionsFinanceModule {}
