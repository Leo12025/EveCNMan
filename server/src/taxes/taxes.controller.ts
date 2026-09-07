import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { TaxesService } from './taxes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('taxes')
export class TaxesController {
  constructor(private readonly taxes: TaxesService) {}

  @Get()
  list(
    @Query('orgId') orgId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.taxes.list({
      orgId: orgId ? Number(orgId) : undefined,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('monthly-summary')
  monthlySummary(@Query('orgId') orgId?: string) {
    return this.taxes.monthlySummary(orgId ? Number(orgId) : undefined);
  }

  @Get('ranking')
  ranking(@Query('limit') limit?: string) {
    return this.taxes.memberRanking(limit ? Number(limit) : 20);
  }

  @Get('trend')
  trend(@Query('months') months?: string) {
    return this.taxes.trend(months ? Number(months) : 6);
  }

  @Post('import')
  @Roles('admin')
  importRecord(@Body() dto: any) {
    return this.taxes.importRecord(dto);
  }
}
