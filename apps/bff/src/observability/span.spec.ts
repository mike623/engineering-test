import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { annotateSpan, withSpan } from './span';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  // Without a context manager there is no active span to annotate — the same
  // thing the NodeSDK installs in the running application.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }),
  );
});

beforeEach(() => exporter.reset());

describe('spans around the interesting failures', () => {
  it('records which of our errors ended the call, not just that it failed', async () => {
    class BreakerOpenError extends Error {}

    await expect(
      withSpan('upstream GET /users', { 'upstream.route': 'GET /users' }, async () => {
        throw new BreakerOpenError('breaker open');
      }),
    ).rejects.toThrow('breaker open');

    const [span] = exporter.getFinishedSpans();

    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    // Without the class name a refused call and a timeout look identical in
    // the trace, and they mean different things.
    expect(span.attributes['error.type']).toBe('BreakerOpenError');
    expect(span.attributes['upstream.route']).toBe('GET /users');
  });

  it('carries the write outcome, so a recovered write is not read as a plain success', async () => {
    await withSpan('create user', {}, async (annotate) => {
      annotate({ 'write.outcome': 'created', 'write.recovered': true });
    });

    const [span] = exporter.getFinishedSpans();

    expect(span.attributes['write.recovered']).toBe(true);
    expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
  });

  it('annotates the span already running, for layers that do not own one', async () => {
    await withSpan('upstream GET /parcs', {}, async () => {
      annotateSpan({ 'cache.state': 'stale', 'cache.age_ms': 1200 });
    });

    const [span] = exporter.getFinishedSpans();

    expect(span.attributes['cache.state']).toBe('stale');
    expect(span.attributes['cache.age_ms']).toBe(1200);
  });
});
