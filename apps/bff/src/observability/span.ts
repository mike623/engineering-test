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
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });

      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Adds attributes to whatever span is already running, for facts discovered by
 * a layer that does not own a span of its own — the cache being one, since it
 * answers inside somebody else's read.
 */
export function annotateSpan(attributes: Attributes): void {
  trace.getActiveSpan()?.setAttributes(attributes);
}
