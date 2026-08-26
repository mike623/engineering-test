import { INestApplication } from '@nestjs/common';
import { EXPOSED_HEADERS } from '../http/response-metadata';
import { traceIdHeader } from '../observability/trace-id.middleware';

/**
 * Everything the running application does to itself before it listens, kept
 * out of `main.ts` so a test can apply exactly the same configuration rather
 * than a plausible copy of it.
 */
export const configureApp = (app: INestApplication): INestApplication => {
  // Response metadata travels in headers, and a browser cannot read a custom
  // header unless it is named here. A server component would not notice the
  // omission, so nothing else would catch it.
  app.enableCors({ origin: true, exposedHeaders: EXPOSED_HEADERS });

  // Before routing, so a request that never reaches a handler still comes back
  // with the id needed to look it up.
  app.use(traceIdHeader);

  return app;
};
