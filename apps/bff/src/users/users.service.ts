import { Injectable, Logger } from '@nestjs/common';
import { ENRICHMENT_FRESHNESS_MS } from '../cache/freshness';
import { Served, SafetyNet } from '../cache/safety-net';
import { UpstreamClient } from '../upstream/upstream.client';
import { validateList, validateOne, ValidatedList } from '../validation/validate';
import { User } from './user';

const LIST = 'GET /users';
const ONE = 'GET /users/:id';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly upstream: UpstreamClient,
    private readonly safetyNet: SafetyNet,
  ) {}

  async findAll(): Promise<Served<ValidatedList<User>>> {
    return this.safetyNet.read('users:list', async () => {
      const body = await this.upstream.get<{ data: unknown }>(LIST, '/users');

      return validateList(User, body?.data, LIST, this.logger);
    });
  }

  /**
   * Used to put a name on a booking. Fetched one at a time rather than by
   * reading the whole collection: users grow without bound, so a list read
   * would get slower forever to resolve a handful of ids. The cost is N+1 —
   * see NOTES.md, where a batch endpoint is the fix worth having.
   */
  async findOne(id: string): Promise<Served<User>> {
    return this.safetyNet.read(
      `users:${id}`,
      async () => {
        const body = await this.upstream.get<unknown>(ONE, `/users/${id}`);

        return validateOne(User, body, ONE, this.logger);
      },
      { freshnessMs: ENRICHMENT_FRESHNESS_MS },
    );
  }
}
