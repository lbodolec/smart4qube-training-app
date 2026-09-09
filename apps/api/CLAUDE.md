# CLAUDE.md — apps/api

Scoped guidance for this workspace. See the root [CLAUDE.md](../../CLAUDE.md) for contract-first conventions and repository boundaries.

## Test commands

Run a single test file: `npx vitest run src/app.test.ts` (from this directory).

## Architecture

- `src/app.ts` (`createApp()`) holds all route logic; `src/server.ts` just starts it listening.
- `src/seed.ts` is the in-memory dataset served by the implemented routes, and defines `KNOWN_PROJECT_IDS` — the set of project ids the stub will recognize (unknown ids get `PROJECT_NOT_FOUND`).
- `src/types.ts` mirrors the `Issue` shape from `../../contracts/openapi.yaml` by hand — update both together when the contract changes.

## Adding a project fixture

If `apps/web/src/infrastructure/fixtures/projects.ts` gets a new project id, add it to `KNOWN_PROJECT_IDS` in `src/seed.ts` too if the API stub needs to serve issues for it.

## Implemented vs. contract-only behavior

The README's stub coverage table lists which operations are implemented; this section covers behavior differences within the operations themselves.

Implemented (`listIssues`, `getIssue`) matches the contract: query filtering (`file`, repeatable `type`/`severity`/`status`, AND across params / OR within a param), `400 INVALID_QUERY` for bad enum values, `404 PROJECT_NOT_FOUND` / `ISSUE_NOT_FOUND`.

Contract-only, not implemented by `createIssue`/`updateIssue`/`deleteIssue` (they always return `501 NOT_IMPLEMENTED` regardless of input):
- Request validation: server-assigned-field rejection on create, immutable-field rejection and empty-body rejection on update, required-field checks — none of this runs; `400 INVALID_BODY` is never actually produced by the stub.
- Success responses: `201` with `Location` header (create), `200` with refreshed `updatedAt` (update), `204` no-body (delete) — none occur.
- `501` itself isn't a documented response in `contracts/openapi.yaml` for any operation; it's a stub-only convention layered on top of the contract, not part of it.
