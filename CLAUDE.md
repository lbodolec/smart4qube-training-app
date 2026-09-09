# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

See the README quickstart (`npm install`, `npm run dev:api`, `npm run dev:web`).

## Test commands

```
npm test              # both workspaces
npm run test:api      # vitest run, apps/api
npm run test:web      # vitest run, apps/web
```

For running a single test file, see [apps/api/CLAUDE.md](apps/api/CLAUDE.md) / [apps/web/CLAUDE.md](apps/web/CLAUDE.md).

## Repository boundaries

- `apps/api` and `apps/web` are independent npm workspaces (own `package.json`, `tsconfig.json`); `contracts/openapi.yaml` at the root is shared by both.
- `apps/api`'s implemented-vs-stubbed operations are documented in the README's stub coverage table — check it before assuming a write endpoint works.
- `apps/web/fixtures/repos/**` are static sample repositories bundled into the web app for the code viewer/file tree; they are not real dependencies and are unrelated to `apps/api` or `apps/web`'s own source.

## Contract requirements

Functional rules from `contracts/openapi.yaml` that any code touching `Issue` data must respect, regardless of what `apps/api` currently enforces (see [apps/api/CLAUDE.md](apps/api/CLAUDE.md) for the implemented subset):

- `severity` and `rule` are non-null iff `type !== 'COMMENT'`; `author` is non-null iff `type === 'COMMENT'`.
- `filePath` is a repo-relative POSIX path (no leading slash); `line` is 1-indexed.
- `projectId` matches `^[a-z0-9][a-z0-9-]*$`; `rule`, when non-null, matches `^S\d+$`.
- Create: `id`, `projectId`, `createdAt`, `updatedAt` are server-assigned — supplying any of them is a validation error.
- Update: `id`, `projectId`, `createdAt`, `author` are immutable — rejected if supplied; an empty update body is also a validation error; `updatedAt` is refreshed server-side on every successful update.
- `listIssues` filters combine with AND across `file`/`type`/`severity`/`status`, and OR within a repeated array-valued param.
- Every non-2xx response uses the shared `ErrorResponse` shape (`code`, `message`, optional `details`), with `code` one of `PROJECT_NOT_FOUND`, `ISSUE_NOT_FOUND`, `INVALID_QUERY`, `INVALID_BODY`, `NOT_IMPLEMENTED`.

## Architecture

**Contract-first**: `contracts/openapi.yaml` is the source of truth for the `Issue` shape and the `/issues` API. `apps/api/src/types.ts` and `apps/web/src/domain/entities/Issue.ts` both mirror it independently — keep them in sync by hand when the contract changes.

See [apps/api/CLAUDE.md](apps/api/CLAUDE.md) and [apps/web/CLAUDE.md](apps/web/CLAUDE.md) for per-workspace architecture.
