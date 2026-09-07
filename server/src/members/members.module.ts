import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { RecruitService } from './recruit.service';
import { RecruitController } from './recruit.controller';
import { MembersScheduler } from './members.scheduler';
import { Membership } from '../common/entities/membership.entity';
import { EveAccount } from '../common/entities/eve-account.entity';
import { Organization } from '../common/entities/organization.entity';
import { Recruit } from './recruit.entity';
import { RecruitGate } from './recruit-gate.entity';
import { CharacterSnapshot } from '../common/entities/character-snapshot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Membership, EveAccount, Organization, Recruit, RecruitGate, CharacterSnapshot])],
  controllers: [MembersController, RecruitController],
  providers: [MembersService, RecruitService, MembersScheduler],
  exports: [MembersService, RecruitService],
})
export class MembersModule {}
