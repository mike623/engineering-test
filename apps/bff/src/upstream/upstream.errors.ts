/** The breaker is open, so no request was sent. Safe to retry later. */
export class BreakerOpenError extends Error {
  constructor(readonly route: string) {
    super(`The circuit breaker for ${route} is open`);
  }
}

/** Upstream answered, and its answer was a client error worth passing on. */
export class UpstreamClientError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`Upstream responded ${status}`);
  }
}

/** Upstream was called and could not be reached, or kept failing. */
export class UpstreamFailureError extends Error {
  constructor(readonly route: string, override readonly cause: unknown) {
    super(`Upstream call to ${route} failed`);
  }
}
