import { Body, Controller, Delete, Get, Param, Post, Query, Redirect, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * 获取 SSO 授权地址（前端新窗口打开）。
   * scope=personal 个人授权（默认，登录/绑定角色）；scope=corp 军团授权（个人 scope + 军团管理 scope）
   */
  @Get('authorize-url')
  async authorizeUrl(@Query('state') state = 'eveman', @Query('scope') scope = 'personal') {
    const kind: 'personal' | 'corp' = scope === 'corp' ? 'corp' : 'personal';
    const url = await this.auth.buildAuthorizeUrl(state, kind);
    const hint =
      kind === 'corp'
        ? '授权完成后浏览器会跳转到 oauth2-redirect 页面，请复制地址栏完整 URL 粘贴到输入框完成「军团授权」（同一角色将升级为军团管理授权）。'
        : '授权完成后浏览器会跳转到 oauth2-redirect 页面，请复制地址栏完整 URL 粘贴到「绑定角色」输入框（个人授权）。';
    return { url, hint, scope: kind };
  }

  /** SSO 回调（仅当应用允许自定义 redirect_uri 时由本后端直接接收） */
  @Get('callback')
  @Redirect()
  async callback(@Query('code') code: string) {
    if (!code) return { url: 'http://localhost:5173/login?error=missing_code' };
    try {
      const tokens = await this.auth.exchangeCode(code);
      const verify = await this.auth.verifyCharacter(tokens.accessToken);
      const token = await this.auth.loginWithCharacter(verify, tokens);
      return { url: `http://localhost:5173/callback?token=${token}&name=${encodeURIComponent(verify.CharacterName)}` };
    } catch {
      return { url: 'http://localhost:5173/login?error=exchange_failed' };
    }
  }

  /** 粘贴授权回调 URL 绑定角色到当前用户 */
  @UseGuards(JwtAuthGuard)
  @Post('bind-code')
  bindCode(@CurrentUser() user: AuthUser, @Body('url') url: string) {
    return this.auth.bindCharacterToUser(user.sub, url);
  }

  /** 当前用户的角色绑定列表（含 token 状态） */
  @UseGuards(JwtAuthGuard)
  @Get('accounts')
  accounts(@CurrentUser() user: AuthUser) {
    return this.auth.accountsOf(user.sub);
  }

  /** 解绑角色 */
  @UseGuards(JwtAuthGuard)
  @Delete('accounts/:id')
  unbind(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auth.unbindAccount(user.sub, Number(id));
  }

  /** 手动刷新角色 token */
  @UseGuards(JwtAuthGuard)
  @Post('accounts/:id/refresh')
  refresh(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auth.refreshAccountTokenById(user.sub, Number(id));
  }

  /** 平台账号登录（用户名 + 密码） */
  @Post('login')
  login(@Body('username') username: string, @Body('password') password: string) {
    return this.auth.loginWithPassword(username, password);
  }

  /** EVE 角色身份切换到其归属的平台账号（验证平台账号密码） */
  @UseGuards(JwtAuthGuard)
  @Post('switch-to-platform')
  switchToPlatform(@CurrentUser() user: AuthUser, @Body('password') password: string) {
    return this.auth.switchToPlatform(user.sub, password);
  }

  /** 未登录 SSO 登录：粘贴弹窗授权完成后的回调 URL 完成登录 */
  @Post('sso-login')
  ssoLogin(@Body('url') url: string) {
    return this.auth.ssoLogin(url);
  }

  /** 演示登录（未配置 SSO 时可用） */
  @Post('mock-login')
  async mockLogin(@Body('username') username: string) {
    return this.auth.mockLogin(username);
  }

  /** 当前登录用户信息 */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }
}
