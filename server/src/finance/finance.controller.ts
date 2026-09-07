import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  @Post('expenses')
  @Roles('admin', 'officer', 'member')
  apply(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.svc.apply(body, { id: user.sub } as any);
  }

  @Get('expenses')
  list(@Query('orgId') orgId?: string, @Query('status') status?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    return this.svc.listExpenses({ orgId: orgId ? +orgId : undefined, status, page: +page, pageSize: +pageSize });
  }

  @Post('expenses/:id/review')
  @Roles('admin', 'officer')
  review(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body('approve') approve: boolean, @Body('note') note?: string) {
    return this.svc.review(+id, { id: user.sub } as any, approve, note);
  }

  @Post('expenses/:id/payout')
  @Roles('admin', 'officer')
  payout(@Param('id') id: string, @Body('ref') ref?: string) {
    return this.svc.payout(+id, ref);
  }

  @Post('payouts/compute')
  @Roles('admin', 'officer')
  compute(@Body('orgId') orgId: number, @Body('period') period: string, @Body('pool') pool: number, @Body('basis') basis = 'tax-ratio') {
    return this.svc.computePayout(orgId, period, pool, basis);
  }

  @Get('payouts')
  listPayouts(@Query('orgId') orgId: string) {
    return this.svc.listPayouts(+orgId);
  }

  @Post('payouts/:id/finalize')
  @Roles('admin')
  finalize(@Param('id') id: string, @Body('status') status: 'approved' | 'paid', @Body('note') note?: string) {
    return this.svc.finalizePayout(+id, status, note);
  }
}
