import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrgsService, CreateOrgDto } from './orgs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get()
  list(@Query('managedOnly') managedOnly?: string, @Query('type') type?: string, @Query('search') search?: string) {
    return this.orgs.list({ managedOnly: managedOnly === 'true', type: type as any, search });
  }

  @Get('tree')
  tree(@Query('managedOnly') managedOnly?: string) {
    return this.orgs.tree(managedOnly !== 'false');
  }

  @Get('my')
  my(@CurrentUser() user: AuthUser) {
    return this.orgs.myOrgs(user.sub);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.orgs.detail(Number(id));
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateOrgDto) {
    return this.orgs.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() patch: Partial<CreateOrgDto>) {
    return this.orgs.update(Number(id), patch);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.orgs.remove(Number(id));
  }
}
