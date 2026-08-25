import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // The web application reads response metadata from headers rather than from
  // the body, so those headers have to survive the CORS boundary.
  app.enableCors({ origin: true, exposedHeaders: ['X-Cache'] });

  await app.listen(Number(process.env.PORT ?? 3002));
}

void bootstrap();
