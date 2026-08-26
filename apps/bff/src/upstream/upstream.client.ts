import { Inject, Injectable } from '@nestjs/common';
import { AxiosInstance, isAxiosError } from 'axios';
import { BreakerRegistry } from './breaker.registry';
import {
  BreakerOpenError,
  UpstreamClientError,
  UpstreamFailureError,
} from './upstream.errors';
import { UPSTREAM_HTTP } from './upstream.tokens';

/**
 * The single door to the supplied API. Timeouts and retries live on the axios
 * instance, the breaker wraps the whole retry cycle, and every failure leaves
 * here as one of three errors the rest of the application can reason about.
 */
@Injectable()
export class UpstreamClient {
  constructor(
    @Inject(UPSTREAM_HTTP) private readonly http: AxiosInstance,
    private readonly breakers: BreakerRegistry,
  ) {}

  /**
   * @param route the route *template*, e.g. `GET /users/:id` — this keys the
   *   breaker, so it must not carry a resolved id.
   */
  async get<T>(route: string, path: string, { force = false } = {}): Promise<T> {
    try {
      const response = await this.breakers.fire(route, () => this.http.get<T>(path), { force });

      return response.data;
    } catch (error) {
      throw this.translate(route, error);
    }
  }

  /**
   * Writes deliberately bypass the breaker. An open breaker on a write would
   * stop us calling an endpoint that still succeeds most of the time, and the
   * reconciliation path already covers a failed write. axios-retry's default
   * condition excludes non-idempotent methods, so this is not retried either.
   */
  async post<T>(route: string, path: string, body: unknown): Promise<T> {
    try {
      const response = await this.http.post<T>(path, body);

      return response.data;
    } catch (error) {
      throw this.translate(route, error);
    }
  }

  private translate(route: string, error: unknown): Error {
    if ((error as { code?: string })?.code === 'EOPENBREAKER') {
      return new BreakerOpenError(route);
    }

    if (isAxiosError(error) && error.response && error.response.status < 500) {
      return new UpstreamClientError(error.response.status, error.response.data);
    }

    return new UpstreamFailureError(route, error);
  }
}
