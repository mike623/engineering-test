import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Parc } from './parc';
import { ParcsService } from './parcs.service';

@Controller('parcs')
export class ParcsController {
  constructor(private readonly parcs: ParcsService) {}

  @Get()
  async findAll(@Res({ passthrough: true }) response: Response): Promise<Parc[]> {
    const result = await this.parcs.findAll();

    // Set only once the call has succeeded: a failed response has no cache
    // state to report, and claiming one would be a lie. Nothing is cached yet,
    // so every success is served straight from upstream.
    response.setHeader('X-Cache', 'miss');

    return result;
  }
}
