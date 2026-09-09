# CLAUDE.md — apps/web

Scoped guidance for this workspace. See the root [CLAUDE.md](../../CLAUDE.md) for contract-first conventions and repository boundaries.

## Test commands

Run a single test file: `npx vitest run src/application/use-cases/issueQueries.test.ts` (from this directory).

## Architecture

Layered/clean-architecture split:
- `domain/` — entities (`Issue`, `Project`) and repository interfaces (`IIssuesRepository`), no framework code. `Issue` is this workspace's hand-mirrored copy of the contract's shape (see root CLAUDE.md).
- `application/use-cases/` — pure query/filter logic over domain entities (e.g. `issueQueries.ts`).
- `infrastructure/` — implementations of domain interfaces: `HttpIssuesRepository` calls the API; `fixtures/projects.ts` loads project source files from `fixtures/repos/**` via `import.meta.glob` (raw text, eager) and indexes them by project id — this is how the file tree / code viewer get source content, independent of the API.
- `presentation/` — React components, pages, and hooks (`useIssues`), consuming the above through SWR.

## Adding a project fixture

Drop files under `fixtures/repos/<projectId>/...` and register a display name in `PROJECT_NAMES` in `src/infrastructure/fixtures/projects.ts`. Also add the id to `KNOWN_PROJECT_IDS` in `apps/api/src/seed.ts` if the API stub needs to recognize it.
