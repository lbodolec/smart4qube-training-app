import useSWR from 'swr';
import type { Issue, IssueSeverity } from '../../domain/entities/Issue';
import { issuesRepository } from '../../infrastructure/api/HttpIssuesRepository';

export function useIssues(
  projectId: string,
  severity?: IssueSeverity[],
): { issues: Issue[]; isLoading: boolean; error: Error | undefined } {
  const severityKey = severity && severity.length > 0 ? [...severity].sort().join(',') : '';
  const { data, isLoading, error } = useSWR<Issue[]>(['issues', projectId, severityKey], () =>
    issuesRepository.listByProject(projectId, severity ? { severity } : undefined),
  );
  return { issues: data ?? [], isLoading, error };
}
