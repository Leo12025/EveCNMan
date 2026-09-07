import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { Expense } from './expense.entity';
import { Payout } from './payout.entity';
import { TaxRecord } from '../common/entities/tax-record.entity';
import { Membership } from '../common/entities/membership.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, Payout, TaxRecord, Membership])],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
