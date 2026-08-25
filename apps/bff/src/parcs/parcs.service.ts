import { Injectable } from '@nestjs/common';
import { UpstreamClient } from '../upstream/upstream.client';
import { Parc } from './parc';

const ROUTE = 'GET /parcs';

@Injectable()
export class ParcsService {
  constructor(private readonly upstream: UpstreamClient) {}

  /**
   * Upstream wraps its collections in a `data` envelope. We unwrap here so the
   * envelope stops at this boundary and never reaches the web application.
   */
  async findAll(): Promise<Parc[]> {
    const body = await this.upstream.get<{ data: Parc[] }>(ROUTE, '/parcs');

    return body.data;
  }
}
