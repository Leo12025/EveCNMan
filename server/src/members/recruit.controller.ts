import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RecruitService } from './recruit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('recruits')
export class RecruitController {
  constructor(private readonly svc: RecruitService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Query('status') status?: string, @Query('orgId') orgId?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.svc.list({ status, orgId: orgId ? +orgId : undefined, page: page ? +page : 1, pageSize: pageSize ? +pageSize : 50 });
  }

  @Post()
  submit(@Body() body: any) {
    return this.svc.submit(body);
  }

  @Get('gate')
  @UseGuards(JwtAuthGuard)
  gate(@Query('orgId') orgId: string, @Query('orgType') orgType = 'corporation') {
    return this.svc.getGate(+orgId, orgType);
  }

  @Post('gate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'officer')
  upsertGate(@Body() body: any) {
    return this.svc.upsertGate(body.orgId, body.orgType || 'corporation', body);
  }

  @Post(':id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'officer')
  review(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body('approve') approve: boolean, @Body('note') note?: string) {
    return this.svc.review(+id, { id: user.sub } as any, approve, note);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'officer')
  join(@Param('id') id: string, @Body('characterId') characterId: number) {
    return this.svc.join(+id, characterId);
  }

  @Post('leave')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'officer')
  leave(@Body('characterId') characterId: number, @Body('orgId') orgId: number, @Body('reason') reason?: string) {
    return this.svc.leave(characterId, orgId, reason);
  }
}
