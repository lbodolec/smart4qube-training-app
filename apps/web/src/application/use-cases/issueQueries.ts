import type { Issue, IssueType, IssueSeverity } from '../../domain/entities/Issue';

const ISSUE_TYPES: IssueType[] = ['VULNERABILITY', 'QUALITY_GATE_VIOLATION', 'COMMENT'];
const ISSUE_SEVERITIES: IssueSeverity[] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];

/**
 * Computes the severity filter to send to the API's `severity` query param, given
 * the current UI toggle state.
 *
 * The API excludes any issue with `severity: null` whenever `severity` is non-empty
 * (see apps/api/src/app.ts), and every COMMENT issue has `severity: null`. So the
 * severity filter can only be sent to the API when COMMENT issues are deselected
 * (`activeTypes` does not include 'COMMENT') — otherwise COMMENT issues would be
 * wrongly excluded from the server response. When COMMENT is selected, this returns
 * `undefined` so the caller fetches unfiltered (or type-filtered only) and relies on
 * client-side filtering for correctness.
 *
 * It also returns `undefined` when `activeSeverities` covers all known severities,
 * since that carries no actual narrowing and sending it would be a redundant param.
 */
export function computeApiSeverityFilter(
  activeTypes: ReadonlySet<IssueType>,
  activeSeverities: ReadonlySet<IssueSeverity>,
): IssueSeverity[] | undefined {
  if (activeTypes.has('COMMENT')) return undefined;
  if (activeSeverities.size >= ISSUE_SEVERITIES.length) return undefined;
  return ISSUE_SEVERITIES.filter((severity) => activeSeverities.has(severity));
}

export function groupIssuesByLine(issues: Issue[]): Map<number, Issue[]> {
  const byLine = new Map<number, Issue[]>();
  for (const issue of issues) {
    const bucket = byLine.get(issue.line) ?? [];
    bucket.push(issue);
    byLine.set(issue.line, bucket);
  }
  return byLine;
}

export function countIssuesByFile(issues: Issue[]): Map<string, number> {
  const byFile = new Map<string, number>();
  for (const issue of issues) {
    byFile.set(issue.filePath, (byFile.get(issue.filePath) ?? 0) + 1);
  }
  return byFile;
}

export function summarize(issues: Issue[]): {
  total: number;
  byType: Record<IssueType, number>;
  bySeverity: Record<IssueSeverity, number>;
} {
  const byType = {} as Record<IssueType, number>;
  for (const type of ISSUE_TYPES) byType[type] = 0;
  const bySeverity = {} as Record<IssueSeverity, number>;
  for (const severity of ISSUE_SEVERITIES) bySeverity[severity] = 0;

  for (const issue of issues) {
    byType[issue.type] += 1;
    if (issue.severity !== null) bySeverity[issue.severity] += 1;
  }

  return { total: issues.length, byType, bySeverity };
}
