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

const ADA = { id: '0f9c2b14-6d3a-4f8e-8c5b-1e2d3a4b5c6d', name: 'Ada', email: 'ada@example.com' };
const GRACE = { id: 'b6d1f0a2-9c47-4f3b-8a11-7e5c2d9b0f34', name: 'Grace', email: 'grace@example.com' };

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
    get.mockResolvedValue({ data: [ADA] });

    const response = await request(app.getHttpServer()).get('/users').expect(200);

    expect(response.body).toEqual([ADA]);
    expect(response.headers['x-cache']).toBe('miss');
    expect(response.headers['x-dropped-records']).toBeUndefined();
  });

  it('drops rows that do not match the contract and says how many', async () => {
    get.mockResolvedValue({
      data: [ADA, { id: 'not-a-uuid', name: 'Bad id', email: 'bad@example.com' }, GRACE],
    });

    const response = await request(app.getHttpServer()).get('/users').expect(200);

    expect(response.body).toEqual([ADA, GRACE]);
    expect(response.headers['x-dropped-records']).toBe('1');
  });

  it('withholds a row whose email upstream never validated on the way in', async () => {
    get.mockResolvedValue({
      data: [ADA, { ...GRACE, email: 'not an address' }],
    });

    const response = await request(app.getHttpServer()).get('/users').expect(200);

    expect(response.body).toEqual([ADA]);
    expect(response.headers['x-dropped-records']).toBe('1');
  });

  it('answers 502 when upstream sends something that is not a list at all', async () => {
    get.mockResolvedValue({ data: { id: ADA.id } });

    await request(app.getHttpServer()).get('/users').expect(502);
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
