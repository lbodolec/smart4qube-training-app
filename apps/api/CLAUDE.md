# CLAUDE.md — apps/api

Scoped guidance for this workspace. See the root [CLAUDE.md](../../CLAUDE.md) for contract-first conventions and repository boundaries.

## Test commands

Run a single test file: `npx vitest run src/app.test.ts` (from this directory).

## Architecture

- `src/app.ts` (`createApp()`) holds all route logic; `src/server.ts` just starts it listening.
- `src/seed.ts` is the in-memory dataset served by the implemented routes, and defines `KNOWN_PROJECT_IDS` — the set of project ids the stub will recognize (unknown ids get `PROJECT_NOT_FOUND`).
- `src/types.ts` is this workspace's hand-mirrored copy of the contract's `Issue` shape (see root CLAUDE.md).

## Adding a project fixture

Full procedure is in [apps/web/CLAUDE.md](../web/CLAUDE.md); this workspace's part is adding the id to `KNOWN_PROJECT_IDS` in `src/seed.ts`.

## Implemented behavior

All five contract operations are implemented (`listIssues`, `getIssue`, `createIssue`, `updateIssue`, `deleteIssue`). Write operations mutate the exported `SEED_ISSUES` array in place — there is no persistence layer, so state resets on restart.

`checkTypeInvariant(type, severity, rule, author)` is the single function shared by `createIssue` and `updateIssue` that enforces the contract's type invariant (`severity`/`rule` non-null iff `type !== 'COMMENT'`; `author` non-null iff `type === 'COMMENT'`), returning human-readable `details[]` strings used in `400 INVALID_BODY` responses.

Emergent design notes worth knowing when debugging:
- Unknown-key rejection is stricter than `contracts/openapi.yaml`'s own schema, which doesn't forbid additional properties — `createIssue`/`updateIssue` reject any key not in their known field list with a per-field `400 INVALID_BODY` detail.
- On create, explicitly supplying `author: null` for a non-`COMMENT` issue is accepted (only a *non-null* `author` on a non-`COMMENT` issue is rejected).
- Because `author` is immutable on update, `type` can never move to/from `COMMENT` via `updateIssue` — doing so always fails `checkTypeInvariant` (the existing `author` won't satisfy the new type's invariant).
- Ids are sequential and never reused: `iss-NNN`, computed at startup from the max existing id in `SEED_ISSUES` and incremented for each new issue.
