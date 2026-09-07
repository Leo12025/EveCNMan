import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { DiplomacyService } from './diplomacy.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('diplomacy')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DiplomacyController {
  constructor(private readonly svc: DiplomacyService) {}

  @Get()
  list(@Query('orgId') orgId: string) {
    return this.svc.list(+orgId);
  }

  @Get('relation/:relation')
  relation(@Query('orgId') orgId: string, @Param('relation') relation: any) {
    return this.svc.relationList(+orgId, relation);
  }

  @Post()
  @Roles('admin', 'officer')
  upsert(@Body() body: any) {
    return this.svc.upsert(body);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.svc.remove(+id);
  }

  @Post('transfers')
  createTransfer(@Body() body: any) {
    return this.svc.createTransfer(body);
  }

  @Get('transfers')
  listTransfers(@Query('status') status?: string) {
    return this.svc.listTransfers(status);
  }

  @Post('transfers/:id/review')
  @Roles('admin', 'officer')
  reviewTransfer(@Param('id') id: string, @Body('approve') approve: boolean, @Body('note') note?: string) {
    return this.svc.reviewTransfer(+id, approve, note);
  }

  @Post('transfers/:id/complete')
  @Roles('admin')
  completeTransfer(@Param('id') id: string) {
    return this.svc.completeTransfer(+id);
  }
}
