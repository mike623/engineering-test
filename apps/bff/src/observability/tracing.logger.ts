import { ConsoleLogger } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

/**
 * Every log line the application already writes, with the trace it belongs to.
 *
 * Without this the logs and the traces are two accounts of the same outage
 * that cannot be joined: "Recovered a write upstream reported as failed" and
 * "Serving parcs from cache" are true of *some* request, and under concurrent
 * traffic there is no way to say which.
 */
export class TracingLogger extends ConsoleLogger {
  protected formatMessage(
    logLevel: Parameters<ConsoleLogger['formatMessage']>[0],
    message: unknown,
    ...rest: Parameters<ConsoleLogger['formatMessage']> extends [unknown, unknown, ...infer R]
      ? R
      : never[]
  ): string {
    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    const line = super.formatMessage(logLevel, message, ...rest);

    if (!traceId) {
      return line;
    }

    // Appended before the newline so the id stays on the same line as the
    // message it belongs to, which is what a grep needs.
    return line.replace(/\n$/, ` trace_id=${traceId}\n`);
  }
}
