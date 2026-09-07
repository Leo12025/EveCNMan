import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { OrgsModule } from './orgs/orgs.module';
import { MembersModule } from './members/members.module';
import { EsiModule } from './esi/esi.module';
import { AssetsModule } from './assets/assets.module';
import { TaxesModule } from './taxes/taxes.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { WalletsModule } from './wallets/wallets.module';
import { StructuresModule } from './structures/structures.module';
import { StructureAlertModule } from './structures/structure-alert.module';
import { SystemModule } from './system/system.module';
import { FinanceModule } from './finance/finance.module';
import { MarketModule } from './market/market.module';
import { IndustryModule } from './industry/industry.module';
import { SrpModule } from './srp/srp.module';
import { FleetModule } from './fleet/fleet.module';
import { DiplomacyModule } from './diplomacy/diplomacy.module';
import { NotifyModule } from './notify/notify.module';
import entities from './common/entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // 默认使用 SQLite，开箱即用。生产环境可将此处切换为 postgres：
        // type: 'postgres', host, port, username, password, database 等，
        // 并安装 @nestjs/typeorm 对应的 pg 驱动，关闭 synchronize 启用迁移。
        type: 'better-sqlite3' as const,
        database: config.get<string>('DB_PATH', 'eveman.db') as string,
        entities,
        synchronize: true, // 开发期自动建表，生产请关闭并启用 migration
        autoLoadEntities: true,
      }),
    }),
    CommonModule,
    AuthModule,
    OrgsModule,
    MembersModule,
    EsiModule,
    AssetsModule,
    TaxesModule,
    DashboardModule,
    WalletsModule,
    StructuresModule,
    StructureAlertModule,
    SystemModule,
    FinanceModule,
    MarketModule,
    IndustryModule,
    SrpModule,
    FleetModule,
    DiplomacyModule,
    NotifyModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
