import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { MarketService } from './market.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('market')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketController {
  constructor(private readonly svc: MarketService) {}

  @Post('orders')
  @Roles('admin', 'officer')
  create(@Body() body: any) {
    return this.svc.createOrder(body);
  }

  @Get('orders')
  list(@Query('orgId') orgId?: string, @Query('side') side?: string, @Query('state') state?: string) {
    return this.svc.listOrders({ orgId: orgId ? +orgId : undefined, side, state });
  }

  @Post('orders/:id/cancel')
  @Roles('admin', 'officer')
  cancel(@Param('id') id: string) {
    return this.svc.cancelOrder(+id);
  }

  @Post('watches')
  @Roles('admin', 'officer')
  watch(@Body() body: any) {
    return this.svc.watch(body);
  }

  @Get('watches')
  listWatches(@Query('typeId') typeId?: string) {
    return this.svc.listWatches(typeId ? +typeId : undefined);
  }

  @Get('compare')
  compare(@Query('typeId') typeId: string, @Query('regions') regions: string) {
    const ids = (regions || '').split(',').map((r) => +r).filter(Boolean);
    return this.svc.compare(+typeId, ids);
  }

  @Get('history')
  history(
    @Query('regionId') regionId: string,
    @Query('typeId') typeId: string,
    @Query('typeName') typeName: string,
    @Query('days') days: string,
  ) {
    return this.svc.historyTrend(+regionId, +typeId, typeName || '', days ? +days : 30);
  }
}
