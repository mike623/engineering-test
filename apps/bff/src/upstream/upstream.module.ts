import { Module } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import axiosRetry, { exponentialDelay } from 'axios-retry';
import { BreakerRegistry } from './breaker.registry';
import { UpstreamClient } from './upstream.client';
import { UpstreamConfig, upstreamConfigFromEnv } from './upstream.config';
import { UPSTREAM_CONFIG, UPSTREAM_HTTP } from './upstream.tokens';

/**
 * Every outbound call goes through this instance, so timeout and retry policy
 * cannot be forgotten at a call site.
 */
export const createUpstreamHttp = (config: UpstreamConfig): AxiosInstance => {
  const http = axios.create({ baseURL: config.baseUrl, timeout: config.timeoutMs });

  // axios-retry declares its parameter against a copy of the axios types that
  // TypeScript treats as distinct from the ones we resolve. Structurally the
  // same instance, so the cast costs nothing and keeps the call honest.
  axiosRetry(http as unknown as Parameters<typeof axiosRetry>[0], {
    retries: config.retries,
    // Jittered exponential backoff. Without jitter a burst of requests that
    // fail together retries together, and upstream is hit by the same burst.
    retryDelay: (retryCount, error) =>
      exponentialDelay(retryCount, error, config.retryDelayMs),
    // Left at the library default (`isNetworkOrIdempotentRequestError`), which
    // already excludes POST. Writes are never retried here — see ADR 0001.
  });

  return http;
};

@Module({
  providers: [
    { provide: UPSTREAM_CONFIG, useFactory: () => upstreamConfigFromEnv() },
    {
      provide: UPSTREAM_HTTP,
      inject: [UPSTREAM_CONFIG],
      useFactory: createUpstreamHttp,
    },
    BreakerRegistry,
    UpstreamClient,
  ],
  exports: [UpstreamClient, BreakerRegistry],
})
export class UpstreamModule {}
