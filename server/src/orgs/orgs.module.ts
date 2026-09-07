import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrgsService } from './orgs.service';
import { OrgsController } from './orgs.controller';
import { Organization } from '../common/entities/organization.entity';
import { Membership } from '../common/entities/membership.entity';
import { EveAccount } from '../common/entities/eve-account.entity';
import { EsiModule } from '../esi/esi.module';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, Membership, EveAccount]), EsiModule],
  controllers: [OrgsController],
  providers: [OrgsService],
  exports: [OrgsService],
})
export class OrgsModule {}
