import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { createApp } from './app.js';

const app = createApp();
const request = supertest(app);

describe('GET /issues/:projectId', () => {
  it('returns every seeded issue for acme-payments', async () => {
    const res = await request.get('/issues/acme-payments');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(9);
    expect(res.body[0]).toEqual({
      id: 'iss-001',
      projectId: 'acme-payments',
      filePath: 'src/auth/login.ts',
      line: 3,
      type: 'VULNERABILITY',
      severity: 'BLOCKER',
      status: 'OPEN',
      rule: 'S6418',
      message: 'Hard-coded credential: a live API token is committed to source.',
      author: null,
      createdAt: '2026-08-14T09:12:00.000Z',
      updatedAt: '2026-08-14T09:12:00.000Z',
    });
  });

  it('filters by file', async () => {
    const res = await request.get('/issues/legacy-billing?file=billing/db.py');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.map((i: { id: string }) => i.id)).toEqual(['iss-015', 'iss-016', 'iss-017']);
  });

  it('filters by type=COMMENT', async () => {
    const res = await request.get('/issues/acme-payments?type=COMMENT');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    for (const issue of res.body) {
      expect(issue.severity).toBeNull();
      expect(issue.rule).toBeNull();
      expect(issue.author).not.toBeNull();
    }
  });

  it('filters by repeated severity parameter with OR semantics', async () => {
    const res = await request.get('/issues/acme-payments?severity=BLOCKER&severity=CRITICAL');
    expect(res.status).toBe(200);
    expect(res.body.map((i: { id: string }) => i.id)).toEqual(['iss-001', 'iss-002', 'iss-006']);
  });

  it('rejects an invalid enum value with 400 INVALID_QUERY', async () => {
    const res = await request.get('/issues/acme-payments?type=NOPE');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_QUERY');
  });

  it('returns 404 PROJECT_NOT_FOUND for an unknown project', async () => {
    const res = await request.get('/issues/unknown-project');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('GET /issues/:projectId/:issueId', () => {
  it('returns a single issue by id', async () => {
    const res = await request.get('/issues/acme-payments/iss-003');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('QUALITY_GATE_VIOLATION');
  });

  it('returns 404 ISSUE_NOT_FOUND when the id belongs to a different project', async () => {
    const res = await request.get('/issues/acme-payments/iss-015');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ISSUE_NOT_FOUND');
  });
});

describe('POST /issues/:projectId (createIssue)', () => {
  it('creates a VULNERABILITY issue and reflects it in detail + list reads', async () => {
    const res = await request.post('/issues/acme-payments').send({
      filePath: 'src/new/file.ts',
      line: 42,
      type: 'VULNERABILITY',
      severity: 'MAJOR',
      rule: 'S1234',
      message: 'A brand new vulnerability.',
    });
    expect(res.status).toBe(201);
    expect(res.headers.location).toMatch(/^\/issues\/acme-payments\/iss-\d+$/);
    expect(res.body.id).toMatch(/^iss-\d+$/);
    expect(res.body).not.toBe('iss-001');
    expect(res.body.severity).toBe('MAJOR');
    expect(res.body.rule).toBe('S1234');
    expect(res.body.message).toBe('A brand new vulnerability.');
    expect(res.body.author).toBeNull();
    expect(res.body.status).toBe('OPEN');
    expect(res.body.createdAt).toBe(res.body.updatedAt);
    expect(new Date(res.body.createdAt).toString()).not.toBe('Invalid Date');

    const detailRes = await request.get(res.headers.location);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body).toEqual(res.body);

    const listRes = await request.get('/issues/acme-payments');
    expect(listRes.body.map((i: { id: string }) => i.id)).toContain(res.body.id);
  });

  it('creates a COMMENT issue with severity/rule null and author set', async () => {
    const res = await request.post('/issues/acme-payments').send({
      filePath: 'src/new/file.ts',
      line: 43,
      type: 'COMMENT',
      author: 'alice',
      message: 'A brand new comment.',
    });
    expect(res.status).toBe(201);
    expect(res.body.severity).toBeNull();
    expect(res.body.rule).toBeNull();
    expect(res.body.author).toBe('alice');
    expect(res.body.status).toBe('OPEN');

    const listRes = await request.get('/issues/acme-payments');
    expect(listRes.body.map((i: { id: string }) => i.id)).toContain(res.body.id);
  });

  it('rejects a body missing multiple required fields', async () => {
    const res = await request.post('/issues/acme-payments').send({
      line: 1,
      type: 'VULNERABILITY',
      severity: 'MAJOR',
      rule: 'S1',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(res.body.details).toContain('filePath: required');
    expect(res.body.details).toContain('message: required');
  });

  it('rejects server-assigned fields supplied on create', async () => {
    const res = await request.post('/issues/acme-payments').send({
      id: 'iss-999',
      createdAt: '2026-01-01T00:00:00.000Z',
      filePath: 'src/x.ts',
      line: 1,
      type: 'VULNERABILITY',
      severity: 'MAJOR',
      rule: 'S1',
      message: 'msg',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(res.body.details).toContain('id: server-assigned field must not be supplied');
    expect(res.body.details).toContain('createdAt: server-assigned field must not be supplied');
  });

  it('rejects an invalid rule format', async () => {
    const res = await request.post('/issues/acme-payments').send({
      filePath: 'src/x.ts',
      line: 1,
      type: 'VULNERABILITY',
      severity: 'MAJOR',
      rule: 'not-a-rule',
      message: 'msg',
    });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('rule: must match pattern ^S\\d+$');
  });

  it('rejects a filePath with a leading slash', async () => {
    const res = await request.post('/issues/acme-payments').send({
      filePath: '/src/x.ts',
      line: 1,
      type: 'VULNERABILITY',
      severity: 'MAJOR',
      rule: 'S1',
      message: 'msg',
    });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain("filePath: must not start with '/'");
  });

  it('rejects a non-COMMENT issue supplying a non-null author', async () => {
    const res = await request.post('/issues/acme-payments').send({
      filePath: 'src/x.ts',
      line: 1,
      type: 'VULNERABILITY',
      severity: 'MAJOR',
      rule: 'S1',
      message: 'msg',
      author: 'bob',
    });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('author: must be omitted or null when type is not COMMENT');
  });

  it('accepts a non-COMMENT issue explicitly supplying author: null', async () => {
    const res = await request.post('/issues/acme-payments').send({
      filePath: 'src/x.ts',
      line: 1,
      type: 'VULNERABILITY',
      severity: 'MAJOR',
      rule: 'S1',
      message: 'msg',
      author: null,
    });
    expect(res.status).toBe(201);
  });

  it('rejects a COMMENT issue supplying a non-null severity', async () => {
    const res = await request.post('/issues/acme-payments').send({
      filePath: 'src/x.ts',
      line: 1,
      type: 'COMMENT',
      severity: 'MAJOR',
      author: 'bob',
      message: 'msg',
    });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('severity: must be null when type is COMMENT');
  });

  it('returns 404 PROJECT_NOT_FOUND for an unknown project even with an invalid body', async () => {
    const res = await request.post('/issues/unknown-project').send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('PUT /issues/:projectId/:issueId (updateIssue)', () => {
  async function createFixture(overrides: Record<string, unknown> = {}) {
    const res = await request.post('/issues/acme-payments').send({
      filePath: 'src/fixture.ts',
      line: 1,
      type: 'VULNERABILITY',
      severity: 'MAJOR',
      rule: 'S1',
      message: 'Fixture issue.',
      ...overrides,
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; createdAt: string; updatedAt: string };
  }

  it('updates fields and reflects the change in a follow-up read', async () => {
    const fixture = await createFixture();
    const res = await request.put(`/issues/acme-payments/${fixture.id}`).send({
      message: 'Updated message.',
      status: 'RESOLVED',
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Updated message.');
    expect(res.body.status).toBe('RESOLVED');
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(fixture.updatedAt).getTime());

    const detailRes = await request.get(`/issues/acme-payments/${fixture.id}`);
    expect(detailRes.body).toEqual(res.body);
  });

  it('rejects an empty body', async () => {
    const res = await request.put('/issues/acme-payments/iss-001').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(res.body.details).toContain('body: at least one field must be supplied');
  });

  it('rejects an immutable field being supplied', async () => {
    const res = await request.put('/issues/acme-payments/iss-001').send({ projectId: 'legacy-billing' });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('projectId: immutable field must not be supplied');
  });

  it('rejects an unrecognized field', async () => {
    const res = await request.put('/issues/acme-payments/iss-001').send({ sevrity: 'MAJOR' });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('sevrity: unknown field');
  });

  it('rejects changing type to COMMENT without clearing severity/rule or supplying an author', async () => {
    const fixture = await createFixture();
    const res = await request.put(`/issues/acme-payments/${fixture.id}`).send({ type: 'COMMENT' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('returns 404 ISSUE_NOT_FOUND for a nonexistent issue', async () => {
    const res = await request.put('/issues/acme-payments/iss-does-not-exist').send({ message: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ISSUE_NOT_FOUND');
  });

  it('returns 404 PROJECT_NOT_FOUND for an unknown project', async () => {
    const res = await request.put('/issues/unknown-project/iss-001').send({ message: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('DELETE /issues/:projectId/:issueId (deleteIssue)', () => {
  async function createFixture() {
    const res = await request.post('/issues/acme-payments').send({
      filePath: 'src/fixture-delete.ts',
      line: 1,
      type: 'VULNERABILITY',
      severity: 'MAJOR',
      rule: 'S1',
      message: 'Fixture issue to delete.',
    });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it('deletes an issue and it disappears from detail and list reads', async () => {
    const fixture = await createFixture();

    const deleteRes = await request.delete(`/issues/acme-payments/${fixture.id}`);
    expect(deleteRes.status).toBe(204);
    expect(deleteRes.body).toEqual({});

    const detailRes = await request.get(`/issues/acme-payments/${fixture.id}`);
    expect(detailRes.status).toBe(404);
    expect(detailRes.body.code).toBe('ISSUE_NOT_FOUND');

    const listRes = await request.get('/issues/acme-payments');
    expect(listRes.body.map((i: { id: string }) => i.id)).not.toContain(fixture.id);
  });

  it('returns 404 ISSUE_NOT_FOUND for a nonexistent issue', async () => {
    const res = await request.delete('/issues/acme-payments/iss-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ISSUE_NOT_FOUND');
  });

  it('returns 404 PROJECT_NOT_FOUND for an unknown project', async () => {
    const res = await request.delete('/issues/unknown-project/iss-001');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });
});
