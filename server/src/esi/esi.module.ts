import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EsiService } from './esi.service';
import { EsiSyncService } from './esi.sync.service';
import { EsiSchedulerService } from './esi.scheduler';
import { EsiController } from './esi.controller';
import { EveAccount } from '../common/entities/eve-account.entity';
import { Organization } from '../common/entities/organization.entity';
import { Membership } from '../common/entities/membership.entity';
import { Asset } from '../common/entities/asset.entity';
import { TaxRecord } from '../common/entities/tax-record.entity';
import { SyncLog } from '../common/entities/sync-log.entity';
import { WalletJournal } from '../common/entities/wallet-journal.entity';
import { WalletBalance } from '../common/entities/wallet-balance.entity';
import { CharacterSnapshot } from '../common/entities/character-snapshot.entity';
import { StructuresModule } from '../structures/structures.module';
import { NotifyModule } from '../notify/notify.module';

@Module({
  imports: [
    StructuresModule,
    NotifyModule,
    TypeOrmModule.forFeature([
      EveAccount,
      Organization,
      Membership,
      Asset,
      TaxRecord,
      SyncLog,
      WalletJournal,
      WalletBalance,
      CharacterSnapshot,
    ]),
  ],
  controllers: [EsiController],
  providers: [EsiService, EsiSyncService, EsiSchedulerService],
  exports: [EsiService, EsiSyncService],
})
export class EsiModule {}
