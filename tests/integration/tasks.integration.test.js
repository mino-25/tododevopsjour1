const request = require('supertest');
const { pool, initSchema } = require('../../src/db');
const app = require('../../src/app');

beforeAll(async () => {
  await initSchema();
});

beforeEach(async () => {
  await pool.query('TRUNCATE TABLE tasks');
});

afterAll(async () => {
  await pool.end();
});

describe('Todo API - tests d\'intégration (vraie base Postgres)', () => {
  test('crée une tâche puis la relit par son id', async () => {
    const createRes = await request(app)
      .post('/api/tasks')
      .send({ description: 'Ecrire le rapport', status: 'todo' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();

    const getRes = await request(app).get(`/api/tasks/${createRes.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.description).toBe('Ecrire le rapport');
  });

  test('404 propre sur un id inexistant', async () => {
    const res = await request(app).get('/api/tasks/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('400 propre sur un corps invalide', async () => {
    const res = await request(app).post('/api/tasks').send({ description: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('supprime une tâche et vérifie sa disparition', async () => {
    const createRes = await request(app)
      .post('/api/tasks')
      .send({ description: 'A supprimer' });

    const deleteRes = await request(app).delete(`/api/tasks/${createRes.body.id}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app).get('/api/tasks');
    expect(listRes.body.find((t) => t.id === createRes.body.id)).toBeUndefined();
  });
});
