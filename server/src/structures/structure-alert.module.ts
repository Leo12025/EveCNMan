import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StructureAlertService } from './structure-alert.service';
import { StructureAlertController } from './structure-alert.controller';
import { StructureAlertScheduler } from './structure-alert.scheduler';
import { StructureAlert } from './structure-alert.entity';
import { Structure } from '../common/entities/structure.entity';
import { Organization } from '../common/entities/organization.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StructureAlert, Structure, Organization])],
  controllers: [StructureAlertController],
  providers: [StructureAlertService, StructureAlertScheduler],
  exports: [StructureAlertService],
})
export class StructureAlertModule {}
