import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AxiosInstance } from 'axios';
import request from 'supertest';
import { UPSTREAM } from '../upstream/upstream.module';
import { ParcsModule } from './parcs.module';

describe('GET /parcs', () => {
  let app: INestApplication;
  const get = jest.fn();

  beforeEach(async () => {
    get.mockReset();

    const moduleRef = await Test.createTestingModule({ imports: [ParcsModule] })
      .overrideProvider(UPSTREAM)
      .useValue({ get } as unknown as AxiosInstance)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the parcs unwrapped from the upstream envelope', async () => {
    get.mockResolvedValue({
      data: { data: [{ id: 'p1', name: 'Duinrell', description: 'Netherlands' }] },
    });

    const response = await request(app.getHttpServer()).get('/parcs').expect(200);

    expect(get).toHaveBeenCalledWith('/parcs');
    expect(response.body).toEqual([
      { id: 'p1', name: 'Duinrell', description: 'Netherlands' },
    ]);
  });

  it('reports how the response was served in a header rather than the body', async () => {
    get.mockResolvedValue({ data: { data: [] } });

    const response = await request(app.getHttpServer()).get('/parcs').expect(200);

    expect(response.headers['x-cache']).toBe('miss');
    expect(response.body).toEqual([]);
  });
});
