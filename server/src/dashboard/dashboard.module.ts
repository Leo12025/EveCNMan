import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { Organization } from '../common/entities/organization.entity';
import { Membership } from '../common/entities/membership.entity';
import { Asset } from '../common/entities/asset.entity';
import { TaxRecord } from '../common/entities/tax-record.entity';
import { EveAccount } from '../common/entities/eve-account.entity';
import { MiningLedger } from '../industry/mining-ledger.entity';
import { SrpClaim } from '../srp/srp.entity';
import { TaxesModule } from '../taxes/taxes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Membership, Asset, TaxRecord, EveAccount, MiningLedger, SrpClaim]),
    TaxesModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
