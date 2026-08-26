import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../core/configure-app';
import { CoreModule } from '../core/core.module';
import { UpstreamClient } from '../upstream/upstream.client';
import { UsersModule } from '../users/users.module';

const ADA = { id: '0f9c2b14-6d3a-4f8e-8c5b-1e2d3a4b5c6d', name: 'Ada', email: 'ada@example.com' };

describe('response metadata', () => {
  let app: INestApplication;
  const get = jest.fn();

  beforeEach(async () => {
    get.mockReset();
    get.mockResolvedValue({ data: [ADA, { id: 'not-a-uuid', name: 'Bad', email: 'b@example.com' }] });

    const moduleRef = await Test.createTestingModule({ imports: [CoreModule, UsersModule] })
      .overrideProvider(UpstreamClient)
      .useValue({ get })
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('is readable by browser JavaScript, not merely present on the response', async () => {
    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    const exposed = (response.headers['access-control-expose-headers'] ?? '')
      .split(',')
      .map((header: string) => header.trim().toLowerCase());

    // Every header the BFF sets has to be listed, or the browser silently
    // cannot see it — and a server component would not reveal the omission.
    for (const header of ['x-cache', 'age', 'x-dropped-records']) {
      expect(response.headers[header]).toBeDefined();
      expect(exposed).toContain(header);
    }
  });
});
