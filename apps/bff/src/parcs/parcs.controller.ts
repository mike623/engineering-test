import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { reportAge, reportCacheState, reportDropped } from '../http/response-metadata';
import { Parc } from './parc';
import { ParcsService } from './parcs.service';

@Controller('parcs')
export class ParcsController {
  constructor(private readonly parcs: ParcsService) {}

  @Get()
  async findAll(@Res({ passthrough: true }) response: Response): Promise<Parc[]> {
    const { value, state, ageMs } = await this.parcs.findAll();

    // Set only once the call has resolved: a failed response has no cache
    // state to report, and claiming one would be a lie.
    reportCacheState(response, state);
    reportAge(response, ageMs);
    reportDropped(response, value.dropped);

    return value.items;
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Parc> {
    const { value, state, ageMs } = await this.parcs.findOne(id);

    reportCacheState(response, state);
    reportAge(response, ageMs);

    return value;
  }
}
