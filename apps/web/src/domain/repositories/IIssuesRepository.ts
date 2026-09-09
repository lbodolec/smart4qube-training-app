import type { Issue, IssueSeverity } from '../entities/Issue';

export interface IIssuesFilters {
  severity?: IssueSeverity[];
}

export interface IIssuesRepository {
  listByProject(projectId: string, filters?: IIssuesFilters): Promise<Issue[]>;
}
