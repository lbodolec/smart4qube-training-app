export type IssueType = 'VULNERABILITY' | 'QUALITY_GATE_VIOLATION' | 'COMMENT';
export type IssueSeverity = 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
export type IssueStatus = 'OPEN' | 'CONFIRMED' | 'RESOLVED' | 'FALSE_POSITIVE';

export const ISSUE_TYPES: IssueType[] = ['VULNERABILITY', 'QUALITY_GATE_VIOLATION', 'COMMENT'];
export const ISSUE_SEVERITIES: IssueSeverity[] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
export const ISSUE_STATUSES: IssueStatus[] = ['OPEN', 'CONFIRMED', 'RESOLVED', 'FALSE_POSITIVE'];

export interface Issue {
  id: string;                      // opaque, server-assigned, e.g. "iss-001"
  projectId: string;               // e.g. "acme-payments"
  filePath: string;                // repo-relative POSIX path, no leading slash
  line: number;                    // 1-indexed
  type: IssueType;
  severity: IssueSeverity | null;  // null iff type === 'COMMENT'
  status: IssueStatus;
  rule: string | null;             // opaque fixture key, /^S\d+$/; null iff type === 'COMMENT'
  message: string;
  author: string | null;           // non-null iff type === 'COMMENT'
  createdAt: string;               // ISO-8601 UTC, e.g. "2026-08-14T09:12:00.000Z"
  updatedAt: string;               // ISO-8601 UTC
}

export interface NewIssue {
  filePath: string;
  line: number;
  type: IssueType;
  severity?: IssueSeverity | null; // null/omitted iff type === 'COMMENT'; required otherwise
  status?: IssueStatus;            // defaults to 'OPEN' when omitted
  rule?: string | null;            // null/omitted iff type === 'COMMENT'; required otherwise, must match ^S\d+$
  message: string;
  author?: string | null;          // required (non-null) iff type === 'COMMENT'; omitted/null otherwise
}

export interface IssueUpdate {
  filePath?: string;
  line?: number;
  type?: IssueType;
  severity?: IssueSeverity | null;
  rule?: string | null;
  status?: IssueStatus;
  message?: string;
  // no `author` — it's immutable on update, not a legal patch field.
}
