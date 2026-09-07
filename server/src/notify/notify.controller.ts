import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { NotifyService } from './notify.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('notify')
export class NotifyController {
  constructor(private readonly svc: NotifyService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthUser, @Query('page') page = '1') {
    return this.svc.list(user.role === 'admin' ? undefined : user.sub, Number(page)).then(([items, total]) => ({ items, total }));
  }

  @Post(':id/read')
  @UseGuards(JwtAuthGuard)
  read(@Param('id') id: string) {
    return this.svc.markRead(Number(id));
  }

  // ---- 管理员：webhook 配置 ----
  @Get('configs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  configs() {
    return this.svc.listConfigs();
  }

  @Post('configs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  upsert(@Body() body: any) {
    return this.svc.upsertConfig(body);
  }

  @Delete('configs/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.svc.removeConfig(Number(id));
  }
}
