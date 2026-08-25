import { Inject, Injectable } from '@nestjs/common';
import { AxiosInstance } from 'axios';
import { UPSTREAM } from '../upstream/upstream.module';
import { Parc } from './parc';

@Injectable()
export class ParcsService {
  constructor(@Inject(UPSTREAM) private readonly http: AxiosInstance) {}

  /**
   * Upstream wraps its collections in a `data` envelope. We unwrap here so the
   * envelope stops at this boundary and never reaches the web application.
   */
  async findAll(): Promise<Parc[]> {
    const response = await this.http.get<{ data: Parc[] }>('/parcs');

    return response.data.data;
  }
}
