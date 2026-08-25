import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UpstreamExceptionFilter } from '../upstream/upstream-exception.filter';
import { UpstreamClient } from '../upstream/upstream.client';
import { UpstreamClientError } from '../upstream/upstream.errors';
import { BookingsModule } from './bookings.module';

const ADA = { id: '0f9c2b14-6d3a-4f8e-8c5b-1e2d3a4b5c6d', name: 'Ada', email: 'ada@example.com' };
const DELETED_USER = 'c1e0b8a7-3f24-4d9c-9b6e-8a7f5d4c3b21';
const DUINRELL = {
  id: '4f1a2c9e-5b7d-4a6f-9c31-2f0f8d6b1a44',
  name: 'Duinrell',
  description: 'Wassenaar, Netherlands',
};

const booking = (id: string, user: string, parc = DUINRELL.id) => ({
  id,
  user,
  parc,
  bookingdate: '2026-07-01T00:00:00.000Z',
  comments: 'Seeded booking',
});

const BOOKING_ONE = booking('9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', ADA.id);
const BOOKING_TWO = booking('1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9', ADA.id);

describe('GET /bookings', () => {
  let app: INestApplication;
  const get = jest.fn();

  const upstreamServes = (bookings: unknown[]) => {
    get.mockImplementation(async (route: string, path: string) => {
      if (route === 'GET /bookings') return { data: bookings };
      if (route === 'GET /parcs') return { data: [DUINRELL] };
      if (path === `/users/${ADA.id}`) return ADA;

      throw new UpstreamClientError(404, { message: 'User not found' });
    });
  };

  beforeEach(async () => {
    get.mockReset();

    const moduleRef = await Test.createTestingModule({
      imports: [BookingsModule],
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

  const bookings = async () => (await request(app.getHttpServer()).get('/bookings').expect(200)).body;

  it('shows who booked what, rather than a pair of identifiers', async () => {
    upstreamServes([BOOKING_ONE]);

    expect(await bookings()).toEqual([
      {
        id: BOOKING_ONE.id,
        bookingDate: BOOKING_ONE.bookingdate,
        comments: 'Seeded booking',
        user: { id: ADA.id, name: 'Ada' },
        parc: { id: DUINRELL.id, name: 'Duinrell' },
      },
    ]);
  });

  it('looks a repeated user up once, not once per booking', async () => {
    upstreamServes([BOOKING_ONE, BOOKING_TWO]);

    await bookings();

    const userLookups = get.mock.calls.filter(([route]) => route === 'GET /users/:id');
    expect(userLookups).toHaveLength(1);
  });

  it('resolves every parc from one cached list rather than one call per booking', async () => {
    upstreamServes([BOOKING_ONE, BOOKING_TWO]);

    await bookings();

    expect(get.mock.calls.filter(([route]) => route === 'GET /parcs')).toHaveLength(1);
  });

  it('still renders a booking whose user has been deleted', async () => {
    upstreamServes([booking('7f6e5d4c-3b2a-4190-8877-665544332211', DELETED_USER)]);

    const [row] = await bookings();

    expect(row.user).toBeNull();
    expect(row.parc).toEqual({ id: DUINRELL.id, name: 'Duinrell' });
  });

  it('drops a booking that is itself malformed, and reports it', async () => {
    upstreamServes([BOOKING_ONE, { ...BOOKING_TWO, bookingdate: 'sometime' }]);

    const response = await request(app.getHttpServer()).get('/bookings').expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.headers['x-dropped-records']).toBe('1');
  });
});
