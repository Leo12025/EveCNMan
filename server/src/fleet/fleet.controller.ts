import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { FleetService } from './fleet.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('fleets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FleetController {
  constructor(private readonly svc: FleetService) {}

  @Post()
  @Roles('admin', 'officer')
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @Get()
  list(@Query('orgId') orgId?: string, @Query('status') status?: string) {
    return this.svc.list({ orgId: orgId ? +orgId : undefined, status });
  }

  @Post('signups')
  signup(@Body() body: any) {
    return this.svc.signup(body);
  }

  @Post('signups/:id/attendance')
  @Roles('admin', 'officer')
  attendance(@Param('id') id: string, @Body('attended') attended: boolean) {
    return this.svc.setAttendance(+id, attended);
  }

  @Get('stats/participation')
  participation(@Query('orgId') orgId: string) {
    return this.svc.participationStats(+orgId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.svc.detail(+id);
  }

  @Post(':id')
  @Roles('admin', 'officer')
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(+id, body);
  }

  @Post(':id/ping')
  @Roles('admin', 'officer')
  ping(@Param('id') id: string, @Body('channels') channels: string) {
    return this.svc.sendPing(+id, channels || 'discord');
  }
}
