import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SrpService } from './srp.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('srp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SrpController {
  constructor(private readonly svc: SrpService) {}

  @Get('rules')
  rules(@Query('orgId') orgId: string) {
    return this.svc.listRules(+orgId);
  }

  @Post('rules')
  @Roles('admin', 'officer')
  upsertRule(@Body() body: any) {
    return this.svc.upsertRule(body);
  }

  @Delete('rules/:id')
  @Roles('admin')
  removeRule(@Param('id') id: string) {
    return this.svc.removeRule(+id);
  }

  @Post('import')
  import(@Body() body: any) {
    return this.svc.importKillmail(body);
  }

  @Get('claims')
  list(@Query('orgId') orgId?: string, @Query('status') status?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    return this.svc.listClaims({ orgId: orgId ? +orgId : undefined, status, page: +page, pageSize: +pageSize });
  }

  @Post('claims/:id/review')
  @Roles('admin', 'officer')
  review(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body('approve') approve: boolean, @Body('reason') reason?: string) {
    return this.svc.review(+id, { id: user.sub } as any, approve, reason);
  }

  @Post('claims/:id/paid')
  @Roles('admin', 'officer')
  paid(@Param('id') id: string, @Body('ref') ref?: string) {
    return this.svc.markPaid(+id, ref);
  }

  @Get('monthly')
  monthly(@Query('orgId') orgId: string) {
    return this.svc.monthlyStats(+orgId);
  }
}
