import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** JWT 认证守卫：校验 Authorization: Bearer <token> */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
