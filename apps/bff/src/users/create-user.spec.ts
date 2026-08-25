import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CoreModule } from '../core/core.module';
import { UpstreamClient } from '../upstream/upstream.client';
import { BreakerOpenError, UpstreamFailureError } from '../upstream/upstream.errors';
import { UsersModule } from './users.module';
import { UsersService } from './users.service';

const ADA = { id: '0f9c2b14-6d3a-4f8e-8c5b-1e2d3a4b5c6d', name: 'Ada', email: 'ada@example.com' };
const GRACE = { id: 'b6d1f0a2-9c47-4f3b-8a11-7e5c2d9b0f34', name: 'Grace', email: 'grace@example.com' };
const NEW_USER = { name: 'Grace', email: 'grace@example.com' };

const outage = () => new UpstreamFailureError('POST /users', new Error('Bad Gateway'));

describe('POST /users', () => {
  let app: INestApplication;
  let users: UsersService;
  const get = jest.fn();
  const post = jest.fn();

  beforeEach(async () => {
    get.mockReset();
    post.mockReset();
    get.mockResolvedValue({ data: [ADA] });

    const moduleRef = await Test.createTestingModule({ imports: [CoreModule, UsersModule] })
      .overrideProvider(UpstreamClient)
      .useValue({ get, post })
      .compile();

    app = moduleRef.createNestApplication();
    users = moduleRef.get(UsersService);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const create = (payload: object = NEW_USER) =>
    request(app.getHttpServer()).post('/users').send(payload);

  it('rejects a body that is not a user before anything reaches upstream', async () => {
    await create({ name: 'Grace', email: 'not an address' }).expect(400);

    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('creates the user when upstream confirms the write', async () => {
    post.mockResolvedValue(GRACE);

    const response = await create().expect(201);

    expect(response.body).toEqual(GRACE);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('refuses an address already in use without attempting a write', async () => {
    get.mockResolvedValue({ data: [ADA, GRACE] });

    const response = await create().expect(409);

    expect(response.body).toMatchObject({ code: 'EMAIL_IN_USE' });
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses to write when the pre-check fails, and says it can be retried', async () => {
    get.mockRejectedValue(outage());

    const response = await create().expect(503);

    expect(response.body).toMatchObject({ code: 'PRECHECK_FAILED' });
    expect(response.headers['retry-after']).toBe('10');
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses to write when the breaker on the pre-check route is open', async () => {
    get.mockRejectedValue(new BreakerOpenError('GET /users'));

    await create().expect(503);

    expect(post).not.toHaveBeenCalled();
  });

  describe('when the write reports failure', () => {
    beforeEach(() => {
      post.mockRejectedValue(outage());
    });

    it('succeeds if the row is there afterwards, because the pre-check proved it was not before', async () => {
      get.mockResolvedValueOnce({ data: [ADA] }).mockResolvedValue({ data: [ADA, GRACE] });

      const response = await create().expect(201);

      expect(response.body).toEqual(GRACE);
      // Never twice: a second attempt is what produces a duplicate user.
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('counts and logs a write it recovered, so a 70% failure rate stays visible', async () => {
      get.mockResolvedValueOnce({ data: [ADA] }).mockResolvedValue({ data: [ADA, GRACE] });

      await create().expect(201);

      expect(users.recoveredWriteCount).toBe(1);
    });

    it('reports WRITE_FAILED when the row is confirmed absent', async () => {
      get.mockResolvedValue({ data: [ADA] });

      const response = await create().expect(502);

      expect(response.body).toMatchObject({ code: 'WRITE_FAILED' });
      expect(users.recoveredWriteCount).toBe(0);
    });

    it('reports WRITE_UNCONFIRMED when the reconciliation read fails too', async () => {
      get.mockResolvedValueOnce({ data: [ADA] }).mockRejectedValue(outage());

      const response = await create().expect(502);

      expect(response.body).toMatchObject({ code: 'WRITE_UNCONFIRMED' });
    });
  });

  it('reads around the cache on both the pre-check and the reconciliation', async () => {
    post.mockRejectedValue(outage());
    get.mockResolvedValueOnce({ data: [ADA] }).mockResolvedValue({ data: [ADA, GRACE] });

    await create().expect(201);

    // Two live reads, either side of the write. A cached list from before the
    // write would have reported a failure for a write that succeeded.
    expect(get.mock.calls.filter(([route]) => route === 'GET /users')).toHaveLength(2);
  });
});
