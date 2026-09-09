import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getProject, getProjectFile } from '../../infrastructure/fixtures/projects';
import { useIssues } from '../hooks/useIssues';
import { summarize, computeApiSeverityFilter } from '../../application/use-cases/issueQueries';
import { FileTree } from '../components/FileTree/FileTree';
import { CodeViewer } from '../components/CodeViewer/CodeViewer';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import type { Issue, IssueSeverity, IssueType } from '../../domain/entities/Issue';

const TYPE_TOGGLES: { type: IssueType; label: string }[] = [
  { type: 'VULNERABILITY', label: 'Vulnerabilities' },
  { type: 'QUALITY_GATE_VIOLATION', label: 'Quality gate' },
  { type: 'COMMENT', label: 'Comments' },
];

const SEVERITY_TOGGLES: IssueSeverity[] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];

export function ProjectPage() {
  const { projectId, '*': filePath } = useParams<{ projectId: string; '*': string }>();
  const [activeTypes, setActiveTypes] = useState<Set<IssueType>>(
    new Set(TYPE_TOGGLES.map((t) => t.type)),
  );
  const [activeSeverities, setActiveSeverities] = useState<Set<IssueSeverity>>(new Set(SEVERITY_TOGGLES));

  const project = projectId ? getProject(projectId) : undefined;
  const apiSeverityFilter = computeApiSeverityFilter(activeTypes, activeSeverities);
  const { issues, isLoading, error } = useIssues(projectId ?? '', apiSeverityFilter);

  const filteredIssues = useMemo(
    () =>
      issues.filter((issue) => {
        if (!activeTypes.has(issue.type)) return false;
        if (issue.type === 'COMMENT') return true;
        return issue.severity !== null && activeSeverities.has(issue.severity);
      }),
    [issues, activeTypes, activeSeverities],
  );

  if (!projectId || !project) {
    return (
      <div>
        <p>Unknown project {projectId}.</p>
        <Link to="/">Back to projects</Link>
      </div>
    );
  }

  const summary = summarize(filteredIssues);
  const selectedPath = filePath ?? '';
  const selectedFile = selectedPath ? getProjectFile(project.id, selectedPath) : undefined;
  const fileIssues = selectedFile
    ? filteredIssues.filter((issue: Issue) => issue.filePath === selectedFile.path)
    : [];

  function toggleType(type: IssueType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleSeverity(severity: IssueSeverity) {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
  }

  return (
    <div>
      <div className="project-page-header">
        <h1 className="project-page-title">{project.name}</h1>
        {isLoading && <LoadingSpinner />}
        {error && <ErrorMessage message={error.message} />}
        {!isLoading && !error && (
          <p className="count-row">
            <span>{summary.total} issues</span>
            <span>{summary.byType.VULNERABILITY} vulnerabilities</span>
            <span>{summary.byType.QUALITY_GATE_VIOLATION} quality gate</span>
            <span>{summary.byType.COMMENT} comments</span>
          </p>
        )}
        <div className="filter-row">
          {TYPE_TOGGLES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              className={`filter-toggle${activeTypes.has(type) ? ' active' : ''}`}
              onClick={() => toggleType(type)}
              aria-pressed={activeTypes.has(type)}
            >
              {label}
            </button>
          ))}
          {SEVERITY_TOGGLES.map((severity) => (
            <button
              key={severity}
              type="button"
              className={`filter-toggle${activeSeverities.has(severity) ? ' active' : ''}`}
              onClick={() => toggleSeverity(severity)}
              aria-pressed={activeSeverities.has(severity)}
            >
              {severity}
            </button>
          ))}
        </div>
      </div>
      <div className="project-layout">
        <FileTree project={project} filteredIssues={filteredIssues} />
        <div className="right-pane">
          {!selectedPath && <p>Select a file to review.</p>}
          {selectedPath && !selectedFile && <p>File not found in this project.</p>}
          {selectedFile && <CodeViewer file={selectedFile} issues={fileIssues} />}
        </div>
      </div>
    </div>
  );
}
