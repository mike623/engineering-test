import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';

/**
 * Started from `main.ts` before anything else is imported, because the
 * instrumentations patch modules as they are required — a module loaded first
 * is never traced.
 *
 * Tracing is off unless an endpoint is configured. The BFF has to keep running
 * for anyone without a collector, and an exporter pointed at nothing retries
 * in the background forever.
 */
export function startTracing(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    return;
  }

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'eurocamp-bff',
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
      headers: headers(),
    }),
    instrumentations: [
      // Ignore our own health endpoint: the container healthcheck polls it
      // every five seconds and would otherwise be most of what we store.
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => (request.url ?? '').startsWith('/health'),
      }),
      new ExpressInstrumentation(),
      new RedisInstrumentation(),
    ],
  });

  sdk.start();

  // Spans are batched, so an unflushed exit loses the last few seconds —
  // during an outage, exactly the interesting part.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void sdk.shutdown().finally(() => process.exit(0));
    });
  }
}

/**
 * `OTEL_EXPORTER_OTLP_HEADERS` is the standard variable, but it is only read
 * automatically for the SDK's own default exporter, not one we construct.
 */
function headers(): Record<string, string> {
  const raw = process.env.OTEL_EXPORTER_OTLP_HEADERS;

  if (!raw) {
    return {};
  }

  return Object.fromEntries(
    raw
      .split(',')
      .map((pair) => pair.split(/=(.*)/s))
      .filter((parts): parts is [string, string, string] => parts.length === 3)
      .map(([name, value]) => [name.trim(), value.trim()]),
  );
}
