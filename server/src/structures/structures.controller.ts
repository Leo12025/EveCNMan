import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { StructuresService } from './structures.service';

@Controller('structures')
export class StructuresController {
  constructor(private readonly service: StructuresService) {}

  @Get()
  list(
    @Query('corporationId') corporationId?: string,
    @Query('allianceId') allianceId?: string,
    @Query('systemId') systemId?: string,
    @Query('typeId') typeId?: string,
    @Query('state') state?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list({
      corporationId: corporationId ? Number(corporationId) : undefined,
      allianceId: allianceId ? Number(allianceId) : undefined,
      systemId: systemId ? Number(systemId) : undefined,
      typeId: typeId ? Number(typeId) : undefined,
      state,
      search,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
    });
  }

  @Get('stats')
  stats(@Query('corporationId') corporationId?: string, @Query('allianceId') allianceId?: string) {
    return this.service.stats(
      corporationId ? Number(corporationId) : undefined,
      allianceId ? Number(allianceId) : undefined,
    );
  }

  @Post(':id/note')
  updateNote(@Param('id') id: string, @Body() body: { note: string }) {
    return this.service.updateNote(id, body.note ?? '');
  }
}
