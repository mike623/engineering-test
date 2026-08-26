import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { Request, Response } from 'express';
import { TRACE_ID_HEADER, traceIdHeader } from './trace-id.middleware';

const provider = new BasicTracerProvider();

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  trace.setGlobalTracerProvider(provider);
});

const run = (): { headers: Record<string, unknown>; nexted: boolean } => {
  const headers: Record<string, unknown> = {};
  let nexted = false;

  traceIdHeader(
    {} as Request,
    { setHeader: (name: string, value: unknown) => (headers[name] = value) } as unknown as Response,
    () => {
      nexted = true;
    },
  );

  return { headers, nexted };
};

describe('handing the caller a trace id', () => {
  it('returns the id of the trace the request is part of', () => {
    const span = provider.getTracer('test').startSpan('incoming');
    const expected = span.spanContext().traceId;

    const { headers } = context.with(trace.setSpan(context.active(), span), run);

    // Without this the traces exist and nobody can find the one they want.
    expect(headers[TRACE_ID_HEADER]).toBe(expected);
  });

  it('passes the request on when tracing is not configured', () => {
    // No active span: the BFF runs with tracing off, and a missing collector
    // must not cost a header, let alone a request.
    const { headers, nexted } = run();

    expect(headers[TRACE_ID_HEADER]).toBeUndefined();
    expect(nexted).toBe(true);
  });
});
