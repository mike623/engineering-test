import { Controller, Get } from '@nestjs/common';
import { SafetyNet } from '../cache/safety-net';
import { BreakerRegistry } from '../upstream/breaker.registry';
import { UsersService } from '../users/users.service';

/** The list payloads worth knowing the age of during an outage. */
const WATCHED_KEYS = ['parcs:list', 'users:list', 'bookings:list'];

@Controller('health')
export class HealthController {
  constructor(
    private readonly breakers: BreakerRegistry,
    private readonly safetyNet: SafetyNet,
    private readonly users: UsersService,
  ) {}

  /**
   * Breaker state is deliberately not on the resource responses — `X-Cache`
   * and `Age` already tell a client what it needs. This is where an operator
   * watches the system move, and where a demonstration shows a breaker open
   * and close.
   */
  @Get('breakers')
  async breakerState() {
    const ages = await Promise.all(
      WATCHED_KEYS.map(async (key) => [key, await this.safetyNet.ageOf(key)] as const),
    );

    return {
      breakers: this.breakers.states(),
      cachedAgeSeconds: Object.fromEntries(
        ages.map(([key, ageMs]) => [key, ageMs === null ? null : Math.round(ageMs / 1000)]),
      ),
      recoveredWrites: this.users.recoveredWriteCount,
    };
  }
}
