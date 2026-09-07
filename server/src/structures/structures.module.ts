import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Structure } from '../common/entities/structure.entity';
import { Organization } from '../common/entities/organization.entity';
import { StructuresService } from './structures.service';
import { StructuresController } from './structures.controller';
import { StructureAlertModule } from './structure-alert.module';

@Module({
  imports: [TypeOrmModule.forFeature([Structure, Organization]), StructureAlertModule],
  controllers: [StructuresController],
  providers: [StructuresService],
  exports: [StructuresService],
})
export class StructuresModule {}
