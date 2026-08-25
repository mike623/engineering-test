import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Parc } from './parc';
import { ParcsService } from './parcs.service';

@Controller('parcs')
export class ParcsController {
  constructor(private readonly parcs: ParcsService) {}

  @Get()
  async findAll(@Res({ passthrough: true }) response: Response): Promise<Parc[]> {
    // Nothing is cached yet, so every response is served straight from
    // upstream. The header is the seam the cache layer later writes through.
    response.setHeader('X-Cache', 'miss');

    return this.parcs.findAll();
  }
}
