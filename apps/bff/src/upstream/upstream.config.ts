export interface UpstreamConfig {
  baseUrl: string;
  /** Applies to each attempt, not to the retry cycle as a whole. */
  timeoutMs: number;
  /** Retries after the first attempt, so `2` means three attempts in total. */
  retries: number;
  /** Base for the exponential backoff; axios-retry adds jitter on top. */
  retryDelayMs: number;
  breaker: {
    errorThresholdPercentage: number;
    /** Failed cycles observed before the breaker is allowed to open. */
    volumeThreshold: number;
    resetTimeoutMs: number;
    /** Shortest gap between user-forced probes of an open breaker. */
    probeIntervalMs: number;
  };
}

const number = (value: string | undefined, fallback: number): number =>
  value === undefined ? fallback : Number(value);

export const upstreamConfigFromEnv = (env = process.env): UpstreamConfig => ({
  baseUrl: env.UPSTREAM_BASE_URL ?? 'http://localhost:3001/api/1',
  timeoutMs: number(env.UPSTREAM_TIMEOUT_MS, 2_000),
  retries: number(env.UPSTREAM_RETRIES, 2),
  retryDelayMs: number(env.UPSTREAM_RETRY_DELAY_MS, 300),
  breaker: {
    errorThresholdPercentage: number(env.BREAKER_ERROR_THRESHOLD_PERCENTAGE, 50),
    volumeThreshold: number(env.BREAKER_VOLUME_THRESHOLD, 5),
    resetTimeoutMs: number(env.BREAKER_RESET_TIMEOUT_MS, 10_000),
    probeIntervalMs: number(env.BREAKER_PROBE_INTERVAL_MS, 5_000),
  },
});
