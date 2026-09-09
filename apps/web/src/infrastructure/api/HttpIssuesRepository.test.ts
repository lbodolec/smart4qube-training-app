import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpIssuesRepository } from './HttpIssuesRepository';

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('HttpIssuesRepository.listByProject', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the plain project URL when no filters are given', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse([]));
    const repo = new HttpIssuesRepository();

    await repo.listByProject('acme-payments');

    expect(fetchSpy).toHaveBeenCalledWith('/issues/acme-payments');
  });

  it('appends one severity entry per value for a partial severity list', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse([]));
    const repo = new HttpIssuesRepository();

    await repo.listByProject('acme-payments', { severity: ['BLOCKER', 'CRITICAL'] });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const [path, query] = calledUrl.split('?');
    expect(path).toBe('/issues/acme-payments');
    const params = new URLSearchParams(query);
    expect(params.getAll('severity')).toEqual(['BLOCKER', 'CRITICAL']);
  });

  it('sends no severity param when filters.severity is an empty array', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse([]));
    const repo = new HttpIssuesRepository();

    await repo.listByProject('acme-payments', { severity: [] });

    expect(fetchSpy).toHaveBeenCalledWith('/issues/acme-payments');
  });

  it('sends no severity param for the "all severities" case (caller passes undefined)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse([]));
    const repo = new HttpIssuesRepository();

    await repo.listByProject('acme-payments', undefined);

    expect(fetchSpy).toHaveBeenCalledWith('/issues/acme-payments');
  });
});
