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

All five `/issues` operations in `contracts/openapi.yaml` are implemented in `src/app.ts`: `listIssues`, `getIssue`, `createIssue`, `updateIssue`, `deleteIssue`. Write operations mutate the in-memory `SEED_ISSUES` array directly — there is still no persistence layer, so restarting the API resets all data back to the 19 seed rows.

The validation/mutation logic is generic across all `IssueType` values (`VULNERABILITY`, `QUALITY_GATE_VIOLATION`, `COMMENT`) since they share one endpoint and payload shape per the contract; `checkTypeInvariant` in `app.ts` is the single function (used by both create and update) enforcing "severity/rule non-null iff type≠COMMENT; author non-null iff type===COMMENT".

Design decisions made beyond the literal contract text (worth knowing when debugging a validation error):
- Any request body key not part of the `NewIssue`/`IssueUpdate` schema — including a typo'd field name — is rejected as `"<field>: unknown field"`, not just the explicitly-named server-assigned/immutable fields. This is stricter than the OpenAPI schema itself (which doesn't forbid additional properties) but keeps error messages diagnostic.
- An explicit `author: null` on a non-COMMENT create/update is treated as equivalent to omitting `author` (accepted); only a non-null `author` on a non-COMMENT issue is rejected. This mirrors how `severity`/`rule` already use explicit `null` to represent the COMMENT state.
- Because `author` is immutable and can never be supplied on `updateIssue`, an issue's `type` can never be changed to or from `COMMENT` via update — only between `VULNERABILITY` and `QUALITY_GATE_VIOLATION`, since both already satisfy "author is null". This is an emergent consequence of enforcing immutability + the type invariant together, not a special case in the code.
- Ids are assigned sequentially as `iss-NNN`, continuing from the highest numeric suffix found in `SEED_ISSUES` at startup; ids are never reused, even after a delete.
