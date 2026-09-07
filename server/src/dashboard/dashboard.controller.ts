import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  overview() {
    return this.dashboard.overview();
  }

  @Get('charts')
  charts() {
    return this.dashboard.charts();
  }

  @Get('rankings')
  rankings() {
    return this.dashboard.rankings();
  }

  /** CSV 导出：members / assets / taxes / rankings */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="export.csv"')
  export(@Query('type') type: string, @Query('orgId') orgId?: string) {
    return this.dashboard.exportCsv(type as any, { orgId: orgId ? +orgId : undefined });
  }
}
