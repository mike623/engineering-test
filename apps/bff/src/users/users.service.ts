import { Injectable } from '@nestjs/common';
import { UpstreamClient } from '../upstream/upstream.client';
import { User } from './user';

const ROUTE = 'GET /users';

@Injectable()
export class UsersService {
  constructor(private readonly upstream: UpstreamClient) {}

  async findAll(): Promise<User[]> {
    const body = await this.upstream.get<{ data: User[] }>(ROUTE, '/users');

    return body.data;
  }
}
