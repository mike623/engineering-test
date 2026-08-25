import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CoreModule } from '../core/core.module';
import { UpstreamClient } from '../upstream/upstream.client';
import { ParcsModule } from './parcs.module';

const DUINRELL = {
  id: '4f1a2c9e-5b7d-4a6f-9c31-2f0f8d6b1a44',
  name: 'Duinrell',
  description: 'Wassenaar, Netherlands',
};

describe('parcs', () => {
  let app: INestApplication;
  const get = jest.fn();

  beforeEach(async () => {
    get.mockReset();

    const moduleRef = await Test.createTestingModule({
      imports: [CoreModule, ParcsModule],
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

  describe('GET /parcs', () => {
    it('returns the parcs unwrapped from the upstream envelope', async () => {
      get.mockResolvedValue({ data: [DUINRELL] });

      const response = await request(app.getHttpServer()).get('/parcs').expect(200);

      expect(get).toHaveBeenCalledWith('GET /parcs', '/parcs');
      expect(response.body).toEqual([DUINRELL]);
    });

    it('reports how the response was served in a header rather than the body', async () => {
      get.mockResolvedValue({ data: [] });

      const response = await request(app.getHttpServer()).get('/parcs').expect(200);

      expect(response.headers['x-cache']).toBe('miss');
      expect(response.body).toEqual([]);
    });

    it('drops a malformed parc rather than failing the whole list', async () => {
      get.mockResolvedValue({ data: [DUINRELL, { id: DUINRELL.id, name: '', description: 'x' }] });

      const response = await request(app.getHttpServer()).get('/parcs').expect(200);

      expect(response.body).toEqual([DUINRELL]);
      expect(response.headers['x-dropped-records']).toBe('1');
    });

    it('strips fields upstream invents, so only the agreed shape is passed on', async () => {
      get.mockResolvedValue({ data: [{ ...DUINRELL, internalNote: 'do not forward' }] });

      const response = await request(app.getHttpServer()).get('/parcs').expect(200);

      expect(response.body).toEqual([DUINRELL]);
    });
  });

  describe('GET /parcs/:id', () => {
    it('returns the parc', async () => {
      get.mockResolvedValue(DUINRELL);

      const response = await request(app.getHttpServer()).get(`/parcs/${DUINRELL.id}`).expect(200);

      expect(get).toHaveBeenCalledWith('GET /parcs/:id', `/parcs/${DUINRELL.id}`);
      expect(response.body).toEqual(DUINRELL);
    });

    it('fails outright when the single resource is malformed, having nothing to degrade to', async () => {
      get.mockResolvedValue({ id: DUINRELL.id, name: 'Duinrell' });

      const response = await request(app.getHttpServer())
        .get(`/parcs/${DUINRELL.id}`)
        .expect(502);

      expect(response.body).toMatchObject({ message: 'Upstream response failed validation' });
      expect(response.headers['x-cache']).toBeUndefined();
    });
  });
});
