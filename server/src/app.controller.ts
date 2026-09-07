import { Controller, Get } from '@nestjs/common';
import { AuthService } from './auth/auth.service';

@Controller()
export class AppController {
  constructor(private readonly auth: AuthService) {}

  /** 平台配置状态（前端设置页展示） */
  @Get('config')
  config() {
    return {
      ssoConfigured: this.auth.ssoConfigured,
      // 官方无申请渠道：默认复用官方 ESI 网页自带 client_id，开箱即用
      defaultClient: this.auth.defaultClient,
      clientId: this.auth.clientId,
      scopes: this.auth.scopes,
      personalScopes: this.auth.personalScopes,
      corpScopes: this.auth.corpScopes,
      esiBase: process.env.EVE_ESI_BASE_URL || 'https://ali-esi.evepc.163.com',
      callbackUrl: process.env.EVE_SSO_CALLBACK_URL || 'http://localhost:3000/api/auth/callback',
      allowMock: this.auth.allowMock,
      version: '0.3.0',
    };
  }
}
