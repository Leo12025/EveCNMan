import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IndustryService } from './industry.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('industry')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IndustryController {
  constructor(private readonly svc: IndustryService) {}

  @Post('jobs')
  @Roles('admin', 'officer')
  create(@Body() body: any) {
    return this.svc.createJob(body);
  }

  @Get('jobs')
  list(@Query('orgId') orgId?: string, @Query('status') status?: string) {
    return this.svc.listJobs({ orgId: orgId ? +orgId : undefined, status });
  }

  @Post('jobs/:id')
  @Roles('admin', 'officer')
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateJob(+id, body);
  }

  @Get('costs')
  costs(@Query('orgId') orgId: string) {
    return this.svc.costSummary(+orgId);
  }

  @Post('ledgers')
  @Roles('admin', 'officer')
  upsertLedger(@Body() body: any) {
    return this.svc.upsertLedger(body);
  }

  @Get('ledgers')
  listLedgers(@Query('orgId') orgId?: string, @Query('period') period?: string, @Query('characterId') characterId?: string) {
    return this.svc.listLedgers({ orgId: orgId ? +orgId : undefined, period, characterId: characterId ? +characterId : undefined });
  }

  @Get('mining-report')
  miningReport(@Query('orgId') orgId: string, @Query('period') period: string) {
    return this.svc.miningReport(+orgId, period);
  }
}
