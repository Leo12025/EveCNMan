import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletBalance } from '../common/entities/wallet-balance.entity';
import { WalletJournal } from '../common/entities/wallet-journal.entity';
import { Organization } from '../common/entities/organization.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WalletBalance, WalletJournal, Organization])],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
