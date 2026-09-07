import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndustryService } from './industry.service';
import { IndustryController } from './industry.controller';
import { IndustryJob } from './job.entity';
import { MiningLedger } from './mining-ledger.entity';

@Module({
  imports: [TypeOrmModule.forFeature([IndustryJob, MiningLedger])],
  controllers: [IndustryController],
  providers: [IndustryService],
})
export class IndustryModule {}
