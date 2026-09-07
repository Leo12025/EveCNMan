import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { EveAccount } from '../common/entities/eve-account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EveAccount])],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
