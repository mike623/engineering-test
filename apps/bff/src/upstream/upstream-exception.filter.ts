import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  BreakerOpenError,
  UpstreamClientError,
  UpstreamFailureError,
} from './upstream.errors';

const RETRY_AFTER_SECONDS = 10;

/**
 * Turns the three upstream failure shapes into the statuses the failure map in
 * NOTES.md promises, in one place, so no controller has to.
 */
@Catch(BreakerOpenError, UpstreamClientError, UpstreamFailureError)
export class UpstreamExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UpstreamExceptionFilter.name);

  catch(error: Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (error instanceof BreakerOpenError) {
      // Nothing was sent upstream, so this is honestly a "come back later".
      this.logger.warn(`Breaker open for ${error.route}`);
      response
        .setHeader('Retry-After', RETRY_AFTER_SECONDS)
        .status(503)
        .json({ statusCode: 503, message: 'Upstream is unavailable' });

      return;
    }

    if (error instanceof UpstreamClientError) {
      // A 404 is upstream's answer, not a fault of ours. Pass it on intact.
      response.status(error.status).json(
        typeof error.body === 'object' && error.body !== null
          ? error.body
          : { statusCode: error.status, message: error.message },
      );

      return;
    }

    this.logger.error(`Upstream call failed: ${error.message}`, (error as UpstreamFailureError).cause);
    response.status(502).json({ statusCode: 502, message: 'Upstream request failed' });
  }
}
