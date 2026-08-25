import { Injectable, Logger } from '@nestjs/common';
import { Served, SafetyNet } from '../cache/safety-net';
import { UpstreamClient } from '../upstream/upstream.client';
import { validateList, ValidatedList } from '../validation/validate';
import { User } from './user';

const LIST = 'GET /users';

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
}
