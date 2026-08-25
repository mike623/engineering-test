import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UpstreamExceptionFilter } from '../upstream/upstream-exception.filter';
import {
  BreakerOpenError,
  UpstreamClientError,
  UpstreamFailureError,
} from '../upstream/upstream.errors';
import { UpstreamClient } from '../upstream/upstream.client';
import { UsersModule } from './users.module';

describe('GET /users', () => {
  let app: INestApplication;
  const get = jest.fn();

  beforeEach(async () => {
    get.mockReset();

    const moduleRef = await Test.createTestingModule({
      imports: [UsersModule],
      providers: [{ provide: APP_FILTER, useClass: UpstreamExceptionFilter }],
    })
      .overrideProvider(UpstreamClient)
      .useValue({ get })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the users unwrapped from the upstream envelope', async () => {
    get.mockResolvedValue({ data: [{ id: 'u1', name: 'Ada', email: 'ada@example.com' }] });

    const response = await request(app.getHttpServer()).get('/users').expect(200);

    expect(response.body).toEqual([{ id: 'u1', name: 'Ada', email: 'ada@example.com' }]);
    expect(response.headers['x-cache']).toBe('miss');
  });

  it('answers 502 when upstream was called and kept failing', async () => {
    get.mockRejectedValue(new UpstreamFailureError('GET /users', new Error('socket hang up')));

    const response = await request(app.getHttpServer()).get('/users').expect(502);

    // A failed response has no cache state, so it must not claim one.
    expect(response.headers['x-cache']).toBeUndefined();
  });

  it('answers 503 with Retry-After when the breaker is open and nothing was sent', async () => {
    get.mockRejectedValue(new BreakerOpenError('GET /users'));

    const response = await request(app.getHttpServer()).get('/users').expect(503);

    expect(response.headers['retry-after']).toBe('10');
    expect(response.headers['x-cache']).toBeUndefined();
  });

  it('passes a client error through untouched, since it is upstream answering', async () => {
    get.mockRejectedValue(new UpstreamClientError(404, { message: 'User not found' }));

    const response = await request(app.getHttpServer()).get('/users').expect(404);

    expect(response.body).toEqual({ message: 'User not found' });
  });
});
