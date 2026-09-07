import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  /** 军团钱包结算 */
  @Get('settle')
  settle(@Query('orgId') orgId: string) {
    return this.wallets.corporationSettle(Number(orgId));
  }

  /** 钱包日志（分页/筛选） */
  @Get('journals')
  journals(
    @Query('orgId') orgId?: string,
    @Query('ownerType') ownerType?: 'corporation' | 'character',
    @Query('refType') refType?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.wallets.journals({
      orgId: orgId ? Number(orgId) : undefined,
      ownerType,
      refType,
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /** 交易类型统计 */
  @Get('ref-types')
  refTypes() {
    return this.wallets.refTypes();
  }
}
