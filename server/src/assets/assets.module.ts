import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { AssetLog } from './asset-log.entity';
import { MaterialNeed } from './material-need.entity';
import { Asset } from '../common/entities/asset.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AssetLog, MaterialNeed, Asset])],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
