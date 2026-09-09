import express from 'express';
import type { Request } from 'express';
import { ISSUE_TYPES, ISSUE_SEVERITIES, ISSUE_STATUSES } from './types.js';
import type { Issue, IssueType, IssueSeverity, IssueStatus } from './types.js';
import { SEED_ISSUES, KNOWN_PROJECT_IDS } from './seed.js';

interface ErrorBody {
  code: string;
  message: string;
  details?: string[];
}

function toArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function isKnownProject(projectId: string): boolean {
  return KNOWN_PROJECT_IDS.includes(projectId as (typeof KNOWN_PROJECT_IDS)[number]);
}

function sendProjectNotFound(res: express.Response, projectId: string) {
  const body: ErrorBody = { code: 'PROJECT_NOT_FOUND', message: `Unknown project '${projectId}'.` };
  res.status(404).json(body);
}

function findIssueIndex(projectId: string, issueId: string): number {
  return SEED_ISSUES.findIndex((i) => i.projectId === projectId && i.id === issueId);
}

function sendIssueNotFound(res: express.Response, projectId: string, issueId: string) {
  const body: ErrorBody = { code: 'ISSUE_NOT_FOUND', message: `Unknown issue '${issueId}' in project '${projectId}'.` };
  res.status(404).json(body);
}

function computeInitialSeq(issues: Issue[]): number {
  let max = 0;
  for (const issue of issues) {
    const m = /^iss-(\d+)$/.exec(issue.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

let issueSeq = computeInitialSeq(SEED_ISSUES);

function nextIssueId(): string {
  issueSeq += 1;
  return `iss-${String(issueSeq).padStart(3, '0')}`;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

function isValidFilePath(v: string): boolean {
  return v.length > 0 && !v.startsWith('/');
}

function isValidRuleFormat(v: string): boolean {
  return /^S\d+$/.test(v);
}

function checkTypeInvariant(
  type: IssueType,
  severity: IssueSeverity | null,
  rule: string | null,
  author: string | null,
): string[] {
  const details: string[] = [];
  if (type === 'COMMENT') {
    if (severity !== null) details.push('severity: must be null when type is COMMENT');
    if (rule !== null) details.push('rule: must be null when type is COMMENT');
    if (author === null) details.push('author: required when type is COMMENT');
  } else {
    if (severity === null) details.push('severity: required when type is not COMMENT');
    else if (!ISSUE_SEVERITIES.includes(severity)) details.push(`severity: '${severity}' is not a valid IssueSeverity`);
    if (rule === null) details.push('rule: required when type is not COMMENT');
    else if (!isValidRuleFormat(rule)) details.push('rule: must match pattern ^S\\d+$');
    if (author !== null) details.push('author: must be omitted or null when type is not COMMENT');
  }
  return details;
}

function classifyExtraKeys(
  body: Record<string, unknown>,
  allowedKeys: readonly string[],
  rejectedKeys: Record<string, string>,
): string[] {
  const details: string[] = [];
  for (const key of Object.keys(body)) {
    if (key in rejectedKeys) details.push(`${key}: ${rejectedKeys[key]} field must not be supplied`);
    else if (!allowedKeys.includes(key)) details.push(`${key}: unknown field`);
  }
  return details;
}

const NEW_ISSUE_KEYS = ['filePath', 'line', 'type', 'severity', 'status', 'rule', 'message', 'author'] as const;
const NEW_ISSUE_SERVER_ASSIGNED: Record<string, string> = {
  id: 'server-assigned',
  projectId: 'server-assigned',
  createdAt: 'server-assigned',
  updatedAt: 'server-assigned',
};

const ISSUE_UPDATE_KEYS = ['filePath', 'line', 'type', 'severity', 'rule', 'status', 'message'] as const;
const ISSUE_UPDATE_IMMUTABLE: Record<string, string> = {
  id: 'immutable',
  projectId: 'immutable',
  createdAt: 'immutable',
  author: 'immutable',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/issues/:projectId', (req, res) => {
    const { projectId } = req.params;
    if (!isKnownProject(projectId)) {
      sendProjectNotFound(res, projectId);
      return;
    }

    const typeValues = toArray(req.query.type);
    const severityValues = toArray(req.query.severity);
    const statusValues = toArray(req.query.status);
    const fileValue = typeof req.query.file === 'string' ? req.query.file : undefined;

    const details: string[] = [];
    for (const v of typeValues) {
      if (!ISSUE_TYPES.includes(v as IssueType)) details.push(`type: '${v}' is not a valid IssueType`);
    }
    for (const v of severityValues) {
      if (!ISSUE_SEVERITIES.includes(v as IssueSeverity)) details.push(`severity: '${v}' is not a valid IssueSeverity`);
    }
    for (const v of statusValues) {
      if (!ISSUE_STATUSES.includes(v as IssueStatus)) details.push(`status: '${v}' is not a valid IssueStatus`);
    }
    if (details.length > 0) {
      const body: ErrorBody = { code: 'INVALID_QUERY', message: 'Invalid query parameter value.', details };
      res.status(400).json(body);
      return;
    }

    let results: Issue[] = SEED_ISSUES.filter((issue) => issue.projectId === projectId);
    if (fileValue !== undefined) {
      results = results.filter((issue) => issue.filePath === fileValue);
    }
    if (typeValues.length > 0) {
      results = results.filter((issue) => typeValues.includes(issue.type));
    }
    if (severityValues.length > 0) {
      results = results.filter((issue) => issue.severity !== null && severityValues.includes(issue.severity));
    }
    if (statusValues.length > 0) {
      results = results.filter((issue) => statusValues.includes(issue.status));
    }

    res.status(200).json(results);
  });

  app.get('/issues/:projectId/:issueId', (req, res) => {
    const { projectId, issueId } = req.params;
    if (!isKnownProject(projectId)) {
      sendProjectNotFound(res, projectId);
      return;
    }
    const idx = findIssueIndex(projectId, issueId);
    if (idx === -1) {
      sendIssueNotFound(res, projectId, issueId);
      return;
    }
    res.status(200).json(SEED_ISSUES[idx]);
  });

  app.post('/issues/:projectId', (req, res) => {
    const { projectId } = req.params;
    if (!isKnownProject(projectId)) {
      sendProjectNotFound(res, projectId);
      return;
    }

    const rawBody = req.body;
    if (!isPlainObject(rawBody)) {
      const body: ErrorBody = { code: 'INVALID_BODY', message: 'The request body is invalid.', details: ['body: must be a JSON object'] };
      res.status(400).json(body);
      return;
    }
    const newIssue = rawBody as Record<string, unknown>;

    const details: string[] = [...classifyExtraKeys(newIssue, NEW_ISSUE_KEYS, NEW_ISSUE_SERVER_ASSIGNED)];

    if (newIssue.filePath === undefined) details.push('filePath: required');
    else if (!isNonEmptyString(newIssue.filePath)) details.push('filePath: must be a non-empty string');
    else if (!isValidFilePath(newIssue.filePath)) details.push("filePath: must not start with '/'");

    if (newIssue.line === undefined) details.push('line: required');
    else if (!isPositiveInteger(newIssue.line)) details.push('line: must be an integer >= 1');

    let type: IssueType | undefined;
    if (newIssue.type === undefined) details.push('type: required');
    else if (!ISSUE_TYPES.includes(newIssue.type as IssueType)) details.push(`type: '${String(newIssue.type)}' is not a valid IssueType`);
    else type = newIssue.type as IssueType;

    if (newIssue.message === undefined) details.push('message: required');
    else if (!isNonEmptyString(newIssue.message)) details.push('message: must be a non-empty string');

    let status: IssueStatus = 'OPEN';
    if (newIssue.status !== undefined) {
      if (!ISSUE_STATUSES.includes(newIssue.status as IssueStatus)) details.push(`status: '${String(newIssue.status)}' is not a valid IssueStatus`);
      else status = newIssue.status as IssueStatus;
    }

    let severity: IssueSeverity | null = null;
    let rule: string | null = null;
    let author: string | null = null;
    if (type !== undefined) {
      severity = (newIssue.severity ?? null) as IssueSeverity | null;
      rule = (newIssue.rule ?? null) as string | null;
      author = (newIssue.author ?? null) as string | null;
      details.push(...checkTypeInvariant(type, severity, rule, author));
    }

    if (details.length > 0) {
      const body: ErrorBody = { code: 'INVALID_BODY', message: 'The request body is invalid.', details };
      res.status(400).json(body);
      return;
    }

    const now = new Date().toISOString();
    const issue: Issue = {
      id: nextIssueId(),
      projectId,
      filePath: newIssue.filePath as string,
      line: newIssue.line as number,
      type: type as IssueType,
      severity: type === 'COMMENT' ? null : severity,
      status,
      rule: type === 'COMMENT' ? null : rule,
      message: newIssue.message as string,
      author: type === 'COMMENT' ? author : null,
      createdAt: now,
      updatedAt: now,
    };
    SEED_ISSUES.push(issue);
    res.status(201).location(`/issues/${projectId}/${issue.id}`).json(issue);
  });

  app.put('/issues/:projectId/:issueId', (req, res) => {
    const { projectId, issueId } = req.params;
    if (!isKnownProject(projectId)) {
      sendProjectNotFound(res, projectId);
      return;
    }
    const idx = findIssueIndex(projectId, issueId);
    if (idx === -1) {
      sendIssueNotFound(res, projectId, issueId);
      return;
    }
    const existing = SEED_ISSUES[idx];

    const rawBody = req.body;
    if (!isPlainObject(rawBody)) {
      const body: ErrorBody = { code: 'INVALID_BODY', message: 'The request body is invalid.', details: ['body: must be a JSON object'] };
      res.status(400).json(body);
      return;
    }
    const patch = rawBody as Record<string, unknown>;

    if (Object.keys(patch).length === 0) {
      const body: ErrorBody = {
        code: 'INVALID_BODY',
        message: 'The request body is invalid.',
        details: ['body: at least one field must be supplied'],
      };
      res.status(400).json(body);
      return;
    }

    const details: string[] = [...classifyExtraKeys(patch, ISSUE_UPDATE_KEYS, ISSUE_UPDATE_IMMUTABLE)];

    if (patch.filePath !== undefined) {
      if (!isNonEmptyString(patch.filePath)) details.push('filePath: must be a non-empty string');
      else if (!isValidFilePath(patch.filePath)) details.push("filePath: must not start with '/'");
    }
    if (patch.line !== undefined) {
      if (!isPositiveInteger(patch.line)) details.push('line: must be an integer >= 1');
    }
    if (patch.type !== undefined) {
      if (!ISSUE_TYPES.includes(patch.type as IssueType)) details.push(`type: '${String(patch.type)}' is not a valid IssueType`);
    }
    if (patch.status !== undefined) {
      if (!ISSUE_STATUSES.includes(patch.status as IssueStatus)) details.push(`status: '${String(patch.status)}' is not a valid IssueStatus`);
    }
    if (patch.rule !== undefined && patch.rule !== null) {
      if (typeof patch.rule !== 'string' || !isValidRuleFormat(patch.rule)) details.push('rule: must match pattern ^S\\d+$');
    }
    if (patch.message !== undefined) {
      if (!isNonEmptyString(patch.message)) details.push('message: must be a non-empty string');
    }

    if (details.length > 0) {
      const body: ErrorBody = { code: 'INVALID_BODY', message: 'The request body is invalid.', details };
      res.status(400).json(body);
      return;
    }

    const mergedType = (patch.type !== undefined ? patch.type : existing.type) as IssueType;
    const mergedSeverity = (patch.severity !== undefined ? patch.severity : existing.severity) as IssueSeverity | null;
    const mergedRule = (patch.rule !== undefined ? patch.rule : existing.rule) as string | null;
    const mergedAuthor = existing.author;

    const invariantErrors = checkTypeInvariant(mergedType, mergedSeverity, mergedRule, mergedAuthor);
    if (invariantErrors.length > 0) {
      const body: ErrorBody = { code: 'INVALID_BODY', message: 'The request body is invalid.', details: invariantErrors };
      res.status(400).json(body);
      return;
    }

    Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
    res.status(200).json(existing);
  });

  app.delete('/issues/:projectId/:issueId', (req, res) => {
    const { projectId, issueId } = req.params;
    if (!isKnownProject(projectId)) {
      sendProjectNotFound(res, projectId);
      return;
    }
    const idx = findIssueIndex(projectId, issueId);
    if (idx === -1) {
      sendIssueNotFound(res, projectId, issueId);
      return;
    }
    SEED_ISSUES.splice(idx, 1);
    res.status(204).end();
  });

  app.use((err: unknown, _req: Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      const body: ErrorBody = { code: 'INVALID_BODY', message: 'The request body is invalid.', details: ['body: malformed JSON'] };
      res.status(400).json(body);
      return;
    }
    next(err);
  });

  app.use((_req, res) => {
    const body: ErrorBody = { code: 'ISSUE_NOT_FOUND', message: 'No such route.' };
    res.status(404).json(body);
  });

  return app;
}
