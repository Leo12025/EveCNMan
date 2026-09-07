import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserController } from './user.controller';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../common/entities/user.entity';
import { EveAccount } from '../common/entities/eve-account.entity';
import { EsiModule } from '../esi/esi.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'please-change-me-to-a-random-string',
      signOptions: { expiresIn: '7d' },
    }),
    TypeOrmModule.forFeature([User, EveAccount]),
    EsiModule,
  ],
  controllers: [AuthController, UserController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
