import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { Parc } from './parc';
import { ParcsService } from './parcs.service';
import { reportCacheState, reportDropped } from '../http/response-metadata';

@Controller('parcs')
export class ParcsController {
  constructor(private readonly parcs: ParcsService) {}

  @Get()
  async findAll(@Res({ passthrough: true }) response: Response): Promise<Parc[]> {
    const { items, dropped } = await this.parcs.findAll();

    reportCacheState(response, 'miss');
    reportDropped(response, dropped);

    return items;
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Parc> {
    const parc = await this.parcs.findOne(id);

    reportCacheState(response, 'miss');

    return parc;
  }
}
