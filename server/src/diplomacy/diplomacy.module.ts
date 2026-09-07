import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiplomacyService } from './diplomacy.service';
import { DiplomacyController } from './diplomacy.controller';
import { Diplomacy } from './diplomacy.entity';
import { Transfer } from './transfer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Diplomacy, Transfer])],
  controllers: [DiplomacyController],
  providers: [DiplomacyService],
})
export class DiplomacyModule {}
