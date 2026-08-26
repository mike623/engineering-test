import { Attributes, SpanStatusCode, trace } from '@opentelemetry/api';

const tracer = trace.getTracer('eurocamp-bff');

/**
 * Runs `work` inside a span. The automatic instrumentations already record
 * that an HTTP call happened and how it ended; these spans exist to record
 * what it *meant* — which route template, which of the three upstream errors,
 * whether a write was recovered. That is the difference between a trace that
 * says "502" and one that says "502, and the row was written anyway".
 *
 * When tracing is not configured this is a no-op span from the API's default
 * provider, so nothing here needs a guard.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  work: (annotate: (extra: Attributes) => void) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await work((extra) => span.setAttributes(extra));
    } catch (error) {
      // recordException keeps the stack; the status is what makes the span
      // show up as failed in a trace list.
      span.recordException(error as Error);
      span.setAttribute('error.type', (error as Error).constructor.name);
      span.setAttributes(causeAttributes(error));
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });

      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Our upstream errors deliberately say the same thing however they failed —
 * `Upstream call to GET /users failed` — because the caller does not act on
 * the difference. Whoever is reading the trace does: an unresolvable host, a
 * refused connection, a timeout and an injected 502 are four different
 * problems, and without this they are one indistinguishable failure.
 */
function causeAttributes(error: unknown): Attributes {
  const cause = (error as { cause?: unknown })?.cause;

  if (!cause) {
    return {};
  }

  const { code, message, response } = cause as {
    code?: string;
    message?: string;
    response?: { status?: number };
  };

  return {
    // `ENOTFOUND` is DNS, `ECONNREFUSED` is nothing listening, `ECONNABORTED`
    // is our own timeout, and a status is upstream answering badly.
    ...(code ? { 'error.cause_code': code } : {}),
    ...(response?.status ? { 'upstream.status_code': response.status } : {}),
    ...(message ? { 'error.cause': message } : {}),
  };
}

/**
 * Adds attributes to whatever span is already running, for facts discovered by
 * a layer that does not own a span of its own — the cache being one, since it
 * answers inside somebody else's read.
 */
export function annotateSpan(attributes: Attributes): void {
  trace.getActiveSpan()?.setAttributes(attributes);
}
