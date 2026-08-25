import { Injectable, Logger } from '@nestjs/common';
import { Served, SafetyNet } from '../cache/safety-net';
import { UpstreamClient } from '../upstream/upstream.client';
import { validateList, validateOne, ValidatedList } from '../validation/validate';
import { Parc } from './parc';

const LIST = 'GET /parcs';
const ONE = 'GET /parcs/:id';

@Injectable()
export class ParcsService {
  private readonly logger = new Logger(ParcsService.name);

  constructor(
    private readonly upstream: UpstreamClient,
    private readonly safetyNet: SafetyNet,
  ) {}

  /**
   * Upstream wraps its collections in a `data` envelope. We unwrap here so the
   * envelope stops at this boundary and never reaches the web application.
   * Only the validated result is handed to the safety net, so a malformed
   * response cannot poison the fallback.
   */
  async findAll(): Promise<Served<ValidatedList<Parc>>> {
    return this.safetyNet.read('parcs:list', async () => {
      const body = await this.upstream.get<{ data: unknown }>(LIST, '/parcs');

      return validateList(Parc, body?.data, LIST, this.logger);
    });
  }

  async findOne(id: string): Promise<Served<Parc>> {
    return this.safetyNet.read(`parcs:${id}`, async () => {
      const body = await this.upstream.get<unknown>(ONE, `/parcs/${id}`);

      return validateOne(Parc, body, ONE, this.logger);
    });
  }
}
