import { Injectable, Logger } from '@nestjs/common';
import { ENRICHMENT_FRESHNESS_MS } from '../cache/freshness';
import { withSpan } from '../observability/span';
import { Served, SafetyNet } from '../cache/safety-net';
import { UpstreamClient } from '../upstream/upstream.client';
import { validateList, validateOne, ValidatedList } from '../validation/validate';
import { CreateUserDto } from './create-user.dto';
import { User } from './user';
import { WriteOutcome } from './write-outcome';

const LIST = 'GET /users';
const ONE = 'GET /users/:id';
const CREATE = 'POST /users';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  /** How often reconciliation found a write that upstream reported as failed. */
  private recoveredWrites = 0;

  constructor(
    private readonly upstream: UpstreamClient,
    private readonly safetyNet: SafetyNet,
  ) {}

  async findAll({ force = false } = {}): Promise<Served<ValidatedList<User>>> {
    return this.safetyNet.read('users:list', () => this.listFromUpstream({ force }));
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

  get recoveredWriteCount(): number {
    return this.recoveredWrites;
  }

  /**
   * Upstream throws its injected failure *after* the row has been committed,
   * so roughly seven in ten successful creates are reported to us as 502s. It
   * reads no idempotency key and mints the id itself, so a retry cannot be
   * made safe — it would simply create a second user. We therefore establish
   * the state, write exactly once, and read back to find out what happened.
   * See ADR 0001.
   */
  async create(payload: CreateUserDto): Promise<WriteOutcome> {
    // The outcome is the thing worth tracing. A recovered write looks like a
    // clean 201 on the wire and a 502 in the upstream span; without this
    // attribute the trace shows a failure that somehow succeeded.
    return withSpan('create user', {}, async (annotate) => {
      const outcome = await this.attemptCreate(payload);

      annotate({
        'write.outcome': outcome.status,
        ...(outcome.status === 'created' ? { 'write.recovered': outcome.recovered } : {}),
      });

      return outcome;
    });
  }

  private async attemptCreate(payload: CreateUserDto): Promise<WriteOutcome> {
    const before = await this.listFromUpstream().catch((error: Error) => {
      // Nothing has been written, so failing closed is safe and honest. It is
      // also the better bet: a read failing now means the reconciliation read
      // would likely fail too, and the request would end up indeterminate
      // rather than merely unfulfilled.
      this.logger.warn(`Refusing to create a user: pre-check failed — ${error.message}`);

      return null;
    });

    if (before === null) {
      return { status: 'precheck-failed' };
    }

    if (this.findByEmail(before, payload.email)) {
      return { status: 'conflict' };
    }

    try {
      const created = await this.upstream.post<unknown>(CREATE, '/users', payload);

      return { status: 'created', user: validateOne(User, created, CREATE, this.logger), recovered: false };
    } catch (error) {
      return this.reconcile(payload, error as Error);
    }
  }

  /**
   * The write reported failure. Because the pre-check proved the address was
   * absent beforehand, a row bearing it now can only be the one we wrote.
   */
  private async reconcile(payload: CreateUserDto, cause: Error): Promise<WriteOutcome> {
    const after = await this.listFromUpstream().catch((error: Error) => {
      this.logger.error(
        `Write of ${payload.email} could not be confirmed either way — ${error.message}`,
      );

      return null;
    });

    if (after === null) {
      return { status: 'unconfirmed' };
    }

    const found = this.findByEmail(after, payload.email);

    if (!found) {
      this.logger.warn(`Write of ${payload.email} failed and the row is absent — ${cause.message}`);

      return { status: 'failed' };
    }

    this.recoveredWrites += 1;
    // Smoothing over a 70% write failure rate without recording it would make
    // the failure invisible to our own monitoring.
    this.logger.warn(
      `Recovered a write upstream reported as failed: user ${found.id} (${this.recoveredWrites} so far)`,
    );

    return { status: 'created', user: found, recovered: true };
  }

  private findByEmail(users: ValidatedList<User>, email: string): User | undefined {
    return users.items.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  /**
   * Deliberately not routed through the safety net. A cached list predating
   * our own write would make reconciliation report a failure for a write that
   * succeeded, which is the exact bug this whole path exists to avoid.
   */
  private async listFromUpstream({ force = false } = {}): Promise<ValidatedList<User>> {
    const body = await this.upstream.get<{ data: unknown }>(LIST, '/users', { force });

    return validateList(User, body?.data, LIST, this.logger);
  }
}
