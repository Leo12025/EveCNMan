import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FleetService } from './fleet.service';
import { FleetController } from './fleet.controller';
import { Fleet } from './fleet.entity';
import { FleetSignup } from './fleet-signup.entity';
import { NotifyModule } from '../notify/notify.module';

@Module({
  imports: [TypeOrmModule.forFeature([Fleet, FleetSignup]), NotifyModule],
  controllers: [FleetController],
  providers: [FleetService],
})
export class FleetModule {}
