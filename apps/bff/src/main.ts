import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EXPOSED_HEADERS } from './http/response-metadata';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // The web application reads response metadata from headers rather than from
  // the body, so those headers have to survive the CORS boundary.
  app.enableCors({ origin: true, exposedHeaders: EXPOSED_HEADERS });

  await app.listen(Number(process.env.PORT ?? 3002));
}

void bootstrap();
