import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { UpstreamConfig } from './upstream.config';
import { UPSTREAM_CONFIG } from './upstream.tokens';

/**
 * One breaker per route template. Keying on a resolved path instead would give
 * `/users/<uuid>` a breaker of its own for every id — each with a sample size
 * of one, none of them ever reaching the volume threshold.
 */
@Injectable()
export class BreakerRegistry implements OnModuleDestroy {
  private readonly breakers = new Map<string, CircuitBreaker<[() => Promise<unknown>], unknown>>();

  constructor(@Inject(UPSTREAM_CONFIG) private readonly config: UpstreamConfig) {}

  async fire<T>(route: string, call: () => Promise<T>): Promise<T> {
    return this.breakerFor(route).fire(call) as Promise<T>;
  }

  states(): Record<string, 'closed' | 'open' | 'half-open'> {
    return Object.fromEntries(
      [...this.breakers].map(([route, breaker]) => [
        route,
        breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
      ]),
    );
  }

  /** Opossum keeps a rolling-window timer per breaker; release them. */
  onModuleDestroy(): void {
    for (const breaker of this.breakers.values()) {
      breaker.shutdown();
    }

    this.breakers.clear();
  }

  private breakerFor(route: string) {
    const existing = this.breakers.get(route);

    if (existing) {
      return existing;
    }

    const breaker = new CircuitBreaker(
      (call: () => Promise<unknown>) => call(),
      {
        name: route,
        // Axios owns timeouts, one per attempt. Opossum's own timeout runs
        // against the whole retry cycle and would abort it part-way through.
        timeout: false,
        errorThresholdPercentage: this.config.breaker.errorThresholdPercentage,
        volumeThreshold: this.config.breaker.volumeThreshold,
        resetTimeout: this.config.breaker.resetTimeoutMs,
        // A 404 is a legitimate answer, not evidence that upstream is unwell.
        // Only 5xx, network errors and timeouts should open a breaker.
        errorFilter: (error: { response?: { status?: number } }) => {
          const status = error?.response?.status;

          return typeof status === 'number' && status < 500;
        },
      },
    );

    this.breakers.set(route, breaker);

    return breaker;
  }
}
