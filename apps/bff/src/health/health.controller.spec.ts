import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CoreModule } from '../core/core.module';
import { UpstreamClient } from '../upstream/upstream.client';
import { UpstreamFailureError } from '../upstream/upstream.errors';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { HealthModule } from './health.module';

const ADA = { id: '0f9c2b14-6d3a-4f8e-8c5b-1e2d3a4b5c6d', name: 'Ada', email: 'ada@example.com' };

describe('GET /health/breakers', () => {
  let app: INestApplication;
  let users: UsersService;
  const get = jest.fn();

  beforeEach(async () => {
    get.mockReset();

    const moduleRef = await Test.createTestingModule({ imports: [CoreModule, HealthModule, UsersModule] })
      .overrideProvider(UpstreamClient)
      .useValue({ get })
      .compile();

    app = moduleRef.createNestApplication();
    users = moduleRef.get(UsersService);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports nothing cached before anything has been read', async () => {
    const response = await request(app.getHttpServer()).get('/health/breakers').expect(200);

    expect(response.body).toEqual({
      breakers: {},
      cachedAgeSeconds: { 'parcs:list': null, 'users:list': null, 'bookings:list': null },
      recoveredWrites: 0,
    });
  });

  it('reports the age of what the safety net is holding', async () => {
    get.mockResolvedValue({ data: [ADA] });
    await users.findAll();

    const response = await request(app.getHttpServer()).get('/health/breakers').expect(200);

    expect(response.body.cachedAgeSeconds['users:list']).toBe(0);
  });

  it('does not blame the cache for an upstream failure', async () => {
    get.mockRejectedValue(new UpstreamFailureError('GET /users', new Error('down')));
    await expect(users.findAll()).rejects.toBeInstanceOf(UpstreamFailureError);

    const response = await request(app.getHttpServer()).get('/health/breakers').expect(200);

    expect(response.body.cachedAgeSeconds['users:list']).toBeNull();
  });
});
