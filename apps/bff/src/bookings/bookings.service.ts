import { Injectable, Logger } from '@nestjs/common';
import { SafetyNet, Served } from '../cache/safety-net';
import { ENRICHMENT_FRESHNESS_MS } from '../cache/freshness';
import { ParcsService } from '../parcs/parcs.service';
import { UpstreamClient } from '../upstream/upstream.client';
import { UsersService } from '../users/users.service';
import { validateList, ValidatedList } from '../validation/validate';
import { Booking, EnrichedBooking, Named } from './booking';

const LIST = 'GET /bookings';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly upstream: UpstreamClient,
    private readonly safetyNet: SafetyNet,
    private readonly users: UsersService,
    private readonly parcs: ParcsService,
  ) {}

  async findAll(): Promise<Served<ValidatedList<EnrichedBooking>>> {
    const served = await this.safetyNet.read('bookings:list', async () => {
      const body = await this.upstream.get<{ data: unknown }>(LIST, '/bookings');

      return validateList(Booking, body?.data, LIST, this.logger);
    });

    return {
      ...served,
      value: {
        dropped: served.value.dropped,
        items: await this.enrich(served.value.items),
      },
    };
  }

  /**
   * Upstream offers no join and no batch lookup, so the names have to be
   * gathered here. The two sides are gathered differently on purpose: parcs
   * are bounded reference data, so one cached list resolves all of them, while
   * users grow without bound and are fetched by id — deduplicated first, so a
   * page of bookings by the same person costs one lookup rather than ten.
   */
  private async enrich(bookings: Booking[]): Promise<EnrichedBooking[]> {
    const [users, parcs] = await Promise.all([
      this.resolveUsers([...new Set(bookings.map((booking) => booking.user))]),
      this.resolveParcs(),
    ]);

    return bookings.map((booking) => ({
      id: booking.id,
      bookingDate: booking.bookingdate,
      comments: booking.comments,
      user: users.get(booking.user) ?? null,
      parc: parcs.get(booking.parc) ?? null,
    }));
  }

  private async resolveUsers(ids: string[]): Promise<Map<string, Named>> {
    const resolved = await Promise.all(
      ids.map(async (id) => {
        try {
          const { value } = await this.users.findOne(id);

          return [id, { id: value.id, name: value.name }] as const;
        } catch (error) {
          // A booking whose user has been deleted is still a booking. Losing
          // the name costs the name, not the row.
          this.logger.warn(`Could not resolve user ${id}: ${(error as Error).message}`);

          return null;
        }
      }),
    );

    return new Map(resolved.filter((entry) => entry !== null));
  }

  private async resolveParcs(): Promise<Map<string, Named>> {
    try {
      const { value } = await this.parcs.findAll({ freshnessMs: ENRICHMENT_FRESHNESS_MS });

      return new Map(value.items.map((parc) => [parc.id, { id: parc.id, name: parc.name }]));
    } catch (error) {
      this.logger.warn(`Could not resolve parc names: ${(error as Error).message}`);

      return new Map();
    }
  }
}
