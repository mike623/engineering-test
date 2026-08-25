import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { reportAge, reportCacheState, reportDropped } from '../http/response-metadata';
import { EnrichedBooking } from './booking';
import { BookingsService } from './bookings.service';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  async findAll(@Res({ passthrough: true }) response: Response): Promise<EnrichedBooking[]> {
    const { value, state, ageMs } = await this.bookings.findAll();

    // Describes the bookings themselves. A name that could not be resolved is
    // reported in the row, as `null`, rather than in the cache state.
    reportCacheState(response, state);
    reportAge(response, ageMs);
    reportDropped(response, value.dropped);

    return value.items;
  }
}
