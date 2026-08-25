import { Logger } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { UpstreamContractError } from '../upstream/upstream.errors';

export interface ValidatedList<T> {
  items: T[];
  /** Rows upstream sent that did not match the contract, and were withheld. */
  dropped: number;
}

const describe = (errors: ValidationError[]): string =>
  errors
    .map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
    .join('; ');

const check = <T extends object>(type: ClassConstructor<T>, row: unknown) => {
  // `excludeExtraneousValues` keeps anything upstream invents out of our
  // response; only fields we declare survive.
  const candidate = plainToInstance(type, row, { excludeExtraneousValues: true });

  return { candidate, errors: validateSync(candidate as object, { whitelist: true }) };
};

/**
 * One malformed row should cost that row, not the page. Bad rows are dropped
 * and counted so the interface can say the view is incomplete.
 */
export const validateList = <T extends object>(
  type: ClassConstructor<T>,
  payload: unknown,
  route: string,
  logger: Logger,
): ValidatedList<T> => {
  if (!Array.isArray(payload)) {
    logger.error(`${route} returned ${typeof payload} where a list was expected`);

    throw new UpstreamContractError(route, 'expected a list');
  }

  const items: T[] = [];
  let dropped = 0;

  for (const row of payload) {
    const { candidate, errors } = check(type, row);

    if (errors.length > 0) {
      dropped += 1;
      logger.warn(`${route} dropped a malformed record — ${describe(errors)}`);
      continue;
    }

    items.push(candidate);
  }

  return { items, dropped };
};

/**
 * A single resource has nothing to degrade to: half a record is worse than an
 * honest failure, so this throws rather than returning something partial.
 */
export const validateOne = <T extends object>(
  type: ClassConstructor<T>,
  payload: unknown,
  route: string,
  logger: Logger,
): T => {
  const { candidate, errors } = check(type, payload);

  if (errors.length > 0) {
    logger.error(`${route} returned a malformed resource — ${describe(errors)}`);

    throw new UpstreamContractError(route, describe(errors));
  }

  return candidate;
};
