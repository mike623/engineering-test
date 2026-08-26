import { trace } from '@opentelemetry/api';
import { NextFunction, Request, Response } from 'express';

export const TRACE_ID_HEADER = 'X-Trace-Id';

/**
 * Puts the trace id on every response, before routing, so it is present on
 * failures too — the responses anyone actually wants to look up.
 *
 * Express middleware rather than a Nest interceptor: an interceptor does not
 * run for a request rejected before it reaches a handler, which is exactly the
 * case where the caller has nothing else to go on.
 *
 * The id comes from the span the HTTP instrumentation has already started. If
 * the caller sent a `traceparent`, that span continues their trace and the
 * header hands back the id they already know — so a failure can be followed
 * across the boundary rather than only within us.
 */
export function traceIdHeader(_request: Request, response: Response, next: NextFunction): void {
  const traceId = trace.getActiveSpan()?.spanContext().traceId;

  if (traceId) {
    response.setHeader(TRACE_ID_HEADER, traceId);
  }

  next();
}
