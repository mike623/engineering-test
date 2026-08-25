import { Module } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

/**
 * Injection token for the single axios instance every upstream call goes
 * through. Retry, timeout and circuit breaker policy all attach here, so no
 * service has to remember to apply them.
 */
export const UPSTREAM = 'UPSTREAM';

export const createUpstreamClient = (): AxiosInstance =>
  axios.create({
    baseURL: process.env.UPSTREAM_BASE_URL ?? 'http://localhost:3001/api/1',
    timeout: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 2000),
  });

@Module({
  providers: [{ provide: UPSTREAM, useFactory: createUpstreamClient }],
  exports: [UPSTREAM],
})
export class UpstreamModule {}
