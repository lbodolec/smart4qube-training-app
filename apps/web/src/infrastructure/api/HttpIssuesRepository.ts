import type { Issue } from '../../domain/entities/Issue';
import type { IIssuesFilters, IIssuesRepository } from '../../domain/repositories/IIssuesRepository';

interface ErrorResponseBody {
  code: string;
  message: string;
  details?: string[];
}

export class HttpIssuesRepository implements IIssuesRepository {
  constructor(private readonly baseUrl: string = '') {}

  async listByProject(projectId: string, filters?: IIssuesFilters): Promise<Issue[]> {
    const params = new URLSearchParams();
    if (filters?.severity && filters.severity.length > 0) {
      for (const severity of filters.severity) {
        params.append('severity', severity);
      }
    }
    const query = params.toString();
    const url = `${this.baseUrl}/issues/${encodeURIComponent(projectId)}${query ? `?${query}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      let message = `Request failed with status ${res.status}`;
      try {
        const body = (await res.json()) as ErrorResponseBody;
        if (body?.message) message = body.message;
      } catch {
        // body was not JSON; keep the fallback message
      }
      throw new Error(message);
    }
    return (await res.json()) as Issue[];
  }
}

export const issuesRepository = new HttpIssuesRepository();
