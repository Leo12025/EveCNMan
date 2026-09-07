import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { StructureAlertService } from './structure-alert.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('structure-alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StructureAlertController {
  constructor(private readonly svc: StructureAlertService) {}

  @Post('generate')
  @Roles('admin', 'officer')
  generate(@Query('corporationId') corporationId: string) {
    return this.svc.generateAlerts(+corporationId);
  }

  @Get()
  list(@Query('corporationId') corporationId?: string, @Query('limit') limit = '50') {
    return this.svc.list(corporationId ? +corporationId : undefined, +limit);
  }

  @Post(':id/resolve')
  @Roles('admin', 'officer')
  resolve(@Param('id') id: string) {
    return this.svc.resolve(+id);
  }
}
