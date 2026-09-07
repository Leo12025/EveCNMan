import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { MembersService } from './members.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(
    @Query('orgId') orgId?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: 'ASC' | 'DESC',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.members.list({
      orgId: orgId ? Number(orgId) : undefined,
      search,
      active,
      sortBy: sortBy as any,
      order,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('stats')
  stats() {
    return this.members.stats();
  }

  @Get('tiers')
  tiers(@Query('orgId') orgId?: string) {
    return this.members.tierStats(orgId ? Number(orgId) : undefined);
  }

  @Post('recompute-tiers')
  @Roles('admin', 'officer')
  recompute(@Query('orgId') orgId?: string) {
    return this.members.recomputeTiers(orgId ? Number(orgId) : undefined);
  }

  @Get(':characterId')
  detail(@Param('characterId') characterId: string) {
    return this.members.detail(Number(characterId));
  }

  @Patch(':characterId')
  @Roles('admin')
  update(@Param('characterId') characterId: string, @Body() body: { isActive?: boolean; monthlyTax?: number; roles?: string[] }) {
    return this.members.update(Number(characterId), body);
  }
}
