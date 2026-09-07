import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { MarketOrder } from './order.entity';
import { PriceWatch } from './price-watch.entity';
import { PriceHistory } from './price-history.entity';
import { EsiModule } from '../esi/esi.module';

@Module({
  imports: [TypeOrmModule.forFeature([MarketOrder, PriceWatch, PriceHistory]), EsiModule],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
