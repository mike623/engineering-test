import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { UpstreamExceptionFilter } from '../upstream/upstream-exception.filter';

/**
 * Cross-cutting request handling, in one place so feature modules — and their
 * tests — do not each have to remember it.
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: UpstreamExceptionFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        // Reject rather than silently strip: a caller sending a field we do
        // not accept has misunderstood something, and upstream's own habit of
        // taking untyped bodies is what this exists to compensate for.
        forbidNonWhitelisted: true,
      }),
    },
  ],
})
export class CoreModule {}
