import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotifyService } from './notify.service';
import { NotifyController } from './notify.controller';
import { Notification } from './notification.entity';
import { NotifyConfig } from './notify-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotifyConfig])],
  controllers: [NotifyController],
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
