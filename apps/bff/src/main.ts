// Before every other import: the instrumentations patch modules as they are
// required, so anything loaded ahead of this is invisible to tracing.
import { startTracing, stopTracing } from './observability/tracing';

startTracing();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './core/configure-app';
import { TracingLogger } from './observability/tracing.logger';

async function bootstrap(): Promise<void> {
  const app = configureApp(
    await NestFactory.create(AppModule, { logger: new TracingLogger() }),
  );

  await app.listen(Number(process.env.PORT ?? 3002));

  // Registering a signal listener replaces Node's default terminate, so this
  // owns the whole shutdown: Nest first, so in-flight requests finish and the
  // Redis connection closes, and only then the trace flush.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void app
        .close()
        .finally(stopTracing)
        .catch((error) => console.error('Shutdown failed', error))
        .finally(() => process.exit(0));
    });
  }
}

void bootstrap();
