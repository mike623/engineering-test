import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Logger, Module } from '@nestjs/common';
import KeyvRedis, { createClient } from '@keyv/redis';
import { Keyv } from 'keyv';
import { SafetyNet } from './safety-net';

/**
 * Redis rather than an in-process store: the fallback has to survive a BFF
 * restart and be shared across instances, or the safety net is empty exactly
 * when it is needed. Falls back to an in-memory store when no Redis URL is
 * configured, so the application still runs for anyone without Docker.
 *
 * The TTL is retention, not freshness — 24 hours is "how old is too old to
 * serve during an outage", not "how long this data is good for". Freshness is
 * decided per read by attempting upstream first. See ADR 0002.
 */
const RETENTION_MS = 24 * 60 * 60 * 1000;

const store = (): Keyv[] => {
  const url = process.env.REDIS_URL;

  if (!url) {
    return [new Keyv()];
  }

  const client = createClient({
    url,
    socket: {
      connectTimeout: 1_000,
      reconnectStrategy: (retries: number) => Math.min(200 * 2 ** retries, 30_000),
    },
    // Fail a command outright while disconnected rather than queueing it. A
    // queued command would hold a request open waiting for a cache that is
    // explicitly allowed to be missing.
    disableOfflineQueue: true,
  });

  // Keyv and KeyvRedis each prefix the key with their own namespace, so
  // setting it in both places stores `bff::bff:users:<id>`. Leaving Keyv's
  // undefined keeps the stored keys as written: `users:<id>`, `parcs:list`.
  const keyv = new Keyv({ store: new KeyvRedis(client), namespace: undefined });

  // Keyv emits on connection trouble; unhandled, it would take the process
  // down for something the safety net is designed to tolerate.
  keyv.on('error', (error) => Logger.error('Cache store error', error, 'CacheModule'));

  return [keyv];
};

@Module({
  // Async so the store is built per container rather than once at import,
  // which keeps test applications from sharing one cache.
  imports: [
    NestCacheModule.registerAsync({
      useFactory: () => ({ stores: store(), ttl: RETENTION_MS }),
    }),
  ],
  providers: [SafetyNet],
  exports: [SafetyNet],
})
export class CacheModule {}
