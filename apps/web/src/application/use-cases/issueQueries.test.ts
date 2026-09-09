import { describe, it, expect } from 'vitest';
import type { Issue, IssueSeverity, IssueType } from '../../domain/entities/Issue';
import { groupIssuesByLine, summarize, computeApiSeverityFilter } from './issueQueries';

const T = '2026-08-14T09:12:00.000Z';

const LOGIN_ISSUES: Issue[] = [
  {
    id: 'iss-001',
    projectId: 'acme-payments',
    filePath: 'src/auth/login.ts',
    line: 3,
    type: 'VULNERABILITY',
    severity: 'BLOCKER',
    status: 'OPEN',
    rule: 'S6418',
    message: 'Hard-coded credential.',
    author: null,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: 'iss-002',
    projectId: 'acme-payments',
    filePath: 'src/auth/login.ts',
    line: 7,
    type: 'VULNERABILITY',
    severity: 'CRITICAL',
    status: 'CONFIRMED',
    rule: 'S3649',
    message: 'SQL injection.',
    author: null,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: 'iss-003',
    projectId: 'acme-payments',
    filePath: 'src/auth/login.ts',
    line: 12,
    type: 'QUALITY_GATE_VIOLATION',
    severity: 'MAJOR',
    status: 'OPEN',
    rule: 'S1440',
    message: 'Use ===.',
    author: null,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: 'iss-004',
    projectId: 'acme-payments',
    filePath: 'src/auth/login.ts',
    line: 12,
    type: 'COMMENT',
    severity: null,
    status: 'OPEN',
    rule: null,
    message: 'Is this hashed anywhere?',
    author: 'marie',
    createdAt: T,
    updatedAt: T,
  },
  {
    id: 'iss-005',
    projectId: 'acme-payments',
    filePath: 'src/auth/login.ts',
    line: 18,
    type: 'VULNERABILITY',
    severity: 'MAJOR',
    status: 'FALSE_POSITIVE',
    rule: 'S2076',
    message: 'Auth bypass exported.',
    author: null,
    createdAt: T,
    updatedAt: T,
  },
];

const CHARGE_COMMENT: Issue = {
  id: 'iss-999',
  projectId: 'acme-payments',
  filePath: 'src/payments/charge.ts',
  line: 12,
  type: 'COMMENT',
  severity: null,
  status: 'OPEN',
  rule: null,
  message: 'Comment only.',
  author: 'tom',
  createdAt: T,
  updatedAt: T,
};

describe('groupIssuesByLine', () => {
  it('groups the five login.ts issues into four line buckets, preserving order', () => {
    const grouped = groupIssuesByLine(LOGIN_ISSUES);
    expect(grouped.size).toBe(4);
    expect(grouped.get(12)?.map((i) => i.id)).toEqual(['iss-003', 'iss-004']);
    expect(grouped.get(5)).toBeUndefined();
  });
});

describe('summarize', () => {
  it('tallies the 9 acme-payments issues by type and severity', () => {
    const acmeNine: Issue[] = [
      LOGIN_ISSUES[0], // VULNERABILITY BLOCKER
      LOGIN_ISSUES[1], // VULNERABILITY CRITICAL
      LOGIN_ISSUES[2], // QUALITY_GATE_VIOLATION MAJOR
      LOGIN_ISSUES[3], // COMMENT
      LOGIN_ISSUES[4], // VULNERABILITY MAJOR
      { ...CHARGE_COMMENT, id: 'iss-006', type: 'VULNERABILITY', severity: 'BLOCKER', rule: 'S5145', author: null },
      { ...CHARGE_COMMENT, id: 'iss-007', type: 'QUALITY_GATE_VIOLATION', severity: 'MINOR', rule: 'S109', author: null },
      { ...CHARGE_COMMENT, id: 'iss-008' },
      { ...CHARGE_COMMENT, id: 'iss-009' },
    ];
    expect(acmeNine).toHaveLength(9);
    const summary = summarize(acmeNine);
    expect(summary.total).toBe(9);
    expect(summary.byType.COMMENT).toBe(3);
    expect(summary.byType.VULNERABILITY).toBe(4);
    expect(summary.byType.QUALITY_GATE_VIOLATION).toBe(2);
    expect(summary.bySeverity.BLOCKER).toBe(2);
    expect(summary.bySeverity.INFO).toBe(0);
  });
});

const ALL_TYPES: IssueType[] = ['VULNERABILITY', 'QUALITY_GATE_VIOLATION', 'COMMENT'];
const ALL_SEVERITIES: IssueSeverity[] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];

describe('computeApiSeverityFilter', () => {
  it('omits the filter when COMMENT is active, even if severities are a strict subset', () => {
    const activeTypes = new Set<IssueType>(ALL_TYPES);
    const activeSeverities = new Set<IssueSeverity>(['BLOCKER', 'CRITICAL']);
    expect(computeApiSeverityFilter(activeTypes, activeSeverities)).toBeUndefined();
  });

  it('omits the filter when all 5 severities are active, even if COMMENT is deselected', () => {
    const activeTypes = new Set<IssueType>(['VULNERABILITY', 'QUALITY_GATE_VIOLATION']);
    const activeSeverities = new Set<IssueSeverity>(ALL_SEVERITIES);
    expect(computeApiSeverityFilter(activeTypes, activeSeverities)).toBeUndefined();
  });

  it('returns the narrowed severity list when COMMENT is deselected and severities are a strict subset', () => {
    const activeTypes = new Set<IssueType>(['VULNERABILITY', 'QUALITY_GATE_VIOLATION']);
    const activeSeverities = new Set<IssueSeverity>(['BLOCKER', 'MAJOR']);
    expect(computeApiSeverityFilter(activeTypes, activeSeverities)).toEqual(['BLOCKER', 'MAJOR']);
  });

  it('returns an empty array (not undefined) when COMMENT is deselected and every severity is toggled off', () => {
    const activeTypes = new Set<IssueType>(['VULNERABILITY']);
    const activeSeverities = new Set<IssueSeverity>();
    expect(computeApiSeverityFilter(activeTypes, activeSeverities)).toEqual([]);
  });
});
