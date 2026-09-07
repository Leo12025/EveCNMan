import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SystemService } from './system.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  /** 管理员：触发数据库备份 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('backup')
  backup() {
    return this.system.backup();
  }

  /** 管理员：列出历史备份 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('backups')
  list() {
    return this.system.listBackups();
  }

  /** 管理员：将历史明文 token 加密（库升级迁移） */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('encrypt-legacy-tokens')
  encryptLegacy() {
    return this.system.encryptLegacyTokens();
  }
}
