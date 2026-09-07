import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  /** 资产列表 */
  @Get()
  list(@Query('ownerType') ownerType?: string, @Query('ownerId') ownerId?: string, @Query('search') search?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.svc.list({ ownerType, ownerId: ownerId ? +ownerId : undefined, search, page: +page, pageSize: +pageSize });
  }

  /** 资产汇总 */
  @Get('summary')
  summary(@Query('ownerType') ownerType?: string, @Query('ownerId') ownerId?: string) {
    return this.svc.summary({ ownerType, ownerId: ownerId ? +ownerId : undefined });
  }

  /** 蓝图库 */
  @Get('blueprints')
  blueprints(@Query('ownerType') ownerType?: string, @Query('ownerId') ownerId?: string, @Query('search') search?: string) {
    return this.svc.blueprints({ ownerType, ownerId: ownerId ? +ownerId : undefined, search });
  }

  // ---------- 变动流水 ----------
  @Post('logs')
  @UseGuards(RolesGuard)
  @Roles('admin', 'officer')
  logTake(@Body() body: any) {
    return this.svc.logTake(body);
  }

  @Get('logs')
  listLogs(@Query('orgId') orgId?: string, @Query('action') action?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    return this.svc.listLogs({ orgId: orgId ? +orgId : undefined, action, page: +page, pageSize: +pageSize });
  }

  // ---------- 材料缺口 ----------
  @Post('needs')
  @UseGuards(RolesGuard)
  @Roles('admin', 'officer')
  upsertNeed(@Body() body: any) {
    return this.svc.upsertNeed(body);
  }

  @Delete('needs/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'officer')
  removeNeed(@Param('id') id: string) {
    return this.svc.removeNeed(+id);
  }

  @Get('needs')
  listNeeds(@Query('orgId') orgId: string) {
    return this.svc.listNeeds(+orgId);
  }

  @Get('gaps')
  gaps(@Query('orgId') orgId: string) {
    return this.svc.gapReport(+orgId);
  }
}
