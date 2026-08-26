// Before every other import: the instrumentations patch modules as they are
// required, so anything loaded ahead of this is invisible to tracing.
import { startTracing } from './observability/tracing';

startTracing();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './core/configure-app';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));

  await app.listen(Number(process.env.PORT ?? 3002));
}

void bootstrap();
