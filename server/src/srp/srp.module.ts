import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SrpService } from './srp.service';
import { SrpController } from './srp.controller';
import { SrpClaim } from './srp.entity';
import { SrpRule } from './srp-rule.entity';
import { EsiModule } from '../esi/esi.module';
import { NotifyModule } from '../notify/notify.module';

@Module({
  imports: [TypeOrmModule.forFeature([SrpClaim, SrpRule]), EsiModule, NotifyModule],
  controllers: [SrpController],
  providers: [SrpService],
})
export class SrpModule {}
