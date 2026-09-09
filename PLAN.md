# Implement createIssue / updateIssue / deleteIssue in apps/api

## Context

`contracts/openapi.yaml` already documents `POST /issues/{projectId}`, `PUT /issues/{projectId}/{issueId}`, and `DELETE /issues/{projectId}/{issueId}`, but on the current `dev` branch `apps/api/src/app.ts` wires all three to a shared `notImplemented` handler that always returns `501 NOT_IMPLEMENTED` (`apps/api/src/app.ts:96-98`). Only `listIssues` and `getIssue` are real. The task asks to implement the three write operations (severity/rule/message/status/file/line in the workflow) while preserving COMMENT CRUD and leaving quality-gate-writes out of scope.

Investigation found that `dev` never actually contains a working COMMENT CRUD implementation — the "exercice 1" commit on `dev` (`f285c8a`) only edited CLAUDE.md docs. The real implementation exists on a separate, unmerged branch `archived` (commit `375f92d`, authored by the same user today): a complete, generic `Issue` CRUD covering all three `IssueType`s (including `COMMENT`) uniformly, matching the contract, with a full test suite. Since the user confirmed to build on that code: `git diff 12eb8e7 dev -- apps/api/src/app.ts apps/api/src/app.test.ts apps/api/src/types.ts apps/api/src/seed.ts` is empty — i.e. these four files are byte-identical between `dev` and the common ancestor `12eb8e7` — so `375f92d`'s versions of `app.ts`, `app.test.ts`, and `types.ts` apply as clean, non-conflicting full-file replacements. Only the doc/config files (`README.md`, `apps/api/CLAUDE.md`, root `package.json`) need hand-reconciliation rather than blind copy, because `dev` has since diverged on those (Smart4Qube rename, existing `issues:list`/`add`/`remove` CLI scripts, an expanded root `CLAUDE.md`). `375f92d`'s `PLAN.md` is exercise scaffolding and is excluded.

## Changes

**`apps/api/src/types.ts`** — append two interfaces after the existing `Issue` (mirrors `contracts/openapi.yaml`'s `NewIssue`/`IssueUpdate` schemas):
- `NewIssue`: `filePath`, `line`, `type` required; `message` required; `severity?`, `status?` (defaults `OPEN`), `rule?`, `author?` optional.
- `IssueUpdate`: all fields optional, no `author` (immutable, not a legal patch field).

**`apps/api/src/app.ts`** — replace the stub `notImplemented` wiring for POST/PUT/DELETE with real handlers, adding these pieces (full reference implementation already reviewed in `375f92d:apps/api/src/app.ts`):
- ID generation: `computeInitialSeq`/`nextIssueId` scan `SEED_ISSUES` at load time for the max `iss-NNN` suffix and increment, ids never reused.
- Shared helpers: `isKnownProject`, `sendProjectNotFound`, `findIssueIndex`, `sendIssueNotFound` (small extraction from the existing GET handlers' inline logic, behavior-preserving).
- Field validators: `isNonEmptyString`, `isPositiveInteger`, `isValidFilePath` (non-empty, no leading `/`), `isValidRuleFormat` (`/^S\d+$/`), `isPlainObject`.
- `checkTypeInvariant(type, severity, rule, author)` — single function shared by create and update enforcing "severity/rule non-null iff type≠COMMENT; author non-null iff type===COMMENT", returning human-readable `details[]` strings.
- `classifyExtraKeys` + `NEW_ISSUE_KEYS`/`NEW_ISSUE_SERVER_ASSIGNED` (`id`, `projectId`, `createdAt`, `updatedAt`) and `ISSUE_UPDATE_KEYS`/`ISSUE_UPDATE_IMMUTABLE` (`id`, `projectId`, `createdAt`, `author`) — rejects server-assigned/immutable/unrecognized keys with per-field `400 INVALID_BODY` detail messages.
- `POST /issues/:projectId`: 404 project check → reject non-object body → validate required fields + shape + optional `status` (default `OPEN`) → run `checkTypeInvariant` when `type` is valid → on any `details`, `400 INVALID_BODY`; otherwise build the `Issue` (new id, `createdAt === updatedAt === now`, force `severity`/`rule` null and `author` set only when `type === 'COMMENT'`), push to `SEED_ISSUES`, respond `201` with `Location: /issues/{projectId}/{id}` header and the created issue.
- `PUT /issues/:projectId/:issueId`: 404 checks → reject non-object/empty body (`400 INVALID_BODY`) → `classifyExtraKeys` against immutable/unknown → per-supplied-field validation → merge patch onto existing (author always from existing) → `checkTypeInvariant` on the merged result → `Object.assign(existing, patch, { updatedAt: now })` → `200` with the updated issue. (Emergent, acceptable behavior: since `author` can't be patched, `type` can only move between `VULNERABILITY`/`QUALITY_GATE_VIOLATION`, never to/from `COMMENT`.)
- `DELETE /issues/:projectId/:issueId`: 404 checks → `SEED_ISSUES.splice(idx, 1)` → `204` no body.
- Add JSON body-parse error middleware (malformed JSON → `400 INVALID_BODY` instead of Express's default HTML error page) before the existing catch-all 404.

No changes needed to `apps/api/src/seed.ts` — `SEED_ISSUES` is already a plain mutable exported array; the new handlers push/splice into it directly (no repository layer to add).

**`apps/api/src/app.test.ts`** — replace the current `describe('write operations')` block (3 tests asserting `501`) with the full coverage from `375f92d`, updated for whichever exact behavior lands in `app.ts`:
- `POST /issues/:projectId (createIssue)`: success creating `VULNERABILITY` (201, `Location` header shape, id regex, `status` defaults, `createdAt === updatedAt`, follow-up GET on both detail and list reflect it); success creating `COMMENT` (severity/rule null, author set); missing-required-field rejection; server-assigned-field rejection; invalid `rule` format; leading-slash `filePath` rejection; non-COMMENT with non-null `author` rejected vs. explicit `author: null` accepted; COMMENT with non-null `severity` rejected; unknown project → 404 even with invalid body.
- `PUT /issues/:projectId/:issueId (updateIssue)`: use a local `createFixture()` helper (POSTs a fresh issue per test, never mutates the 19 seed rows) — success + refreshed `updatedAt` + follow-up GET match; empty-body rejection; immutable-field-supplied rejection; unrecognized-field rejection; type-invariant merge violation; issue/project not-found.
- `DELETE /issues/:projectId/:issueId (deleteIssue)`: own `createFixture()` helper — success (204, empty body, follow-up detail 404 + absent from list); issue/project not-found.
- Convention: assert generated ids by regex, not literal value (order-independent across the full suite).

**`package.json`** (root) — add the one missing CLI script entry: `"issues:update": "bash scripts/update-issue.sh"` alongside the existing `issues:list`/`issues:add`/`issues:remove`.

**`scripts/update-issue.sh`** (new file) — copy `375f92d`'s version verbatim; it already uses the `SMART4QUBE_API_URL` env var, consistent with `dev`'s existing `add-issue.sh`/`list-issues.sh`/`remove-issue.sh`. PUTs a JSON patch file to `$API_URL/issues/:projectId/:issueId`, expects `200`.

**`scripts/examples/issue-update.json`** (new file) — copy `375f92d`'s version verbatim (`{"status": "RESOLVED"}`), alongside the existing `comment.json`/`quality-gate-violation.json`/`vulnerability.json` templates.

**`README.md`** — update the "Stub coverage" section to reflect all five operations implemented (reword intro paragraph and flip the three write rows from `501 NOT_IMPLEMENTED` to `Implemented` in the table), following `375f92d`'s wording but keeping `dev`'s current Smart4Qube branding (no title change needed — already renamed).

**`apps/api/CLAUDE.md`** — replace the "Implemented vs. contract-only behavior" section (currently describes the 501-stub behavior) with an "Implemented behavior" section documenting: all five operations implemented, write ops mutate `SEED_ISSUES` in place with no persistence layer, `checkTypeInvariant` is the shared invariant-enforcement function, plus the emergent design notes worth knowing when debugging (unknown-key rejection is stricter than the OpenAPI schema's own additionalProperties-permissive stance; explicit `author: null` on non-COMMENT is accepted; `type` can never move to/from `COMMENT` via update; sequential never-reused `iss-NNN` ids). Leave the rest of the file (Test commands, Architecture, Adding a project fixture) unchanged.

Root `CLAUDE.md` needs no edit — its existing wording already points to `apps/api/CLAUDE.md`/the README table rather than asserting anything is unimplemented, so it stays accurate once the above lands.

## Out of scope (per task)

- Quality gate violation write support beyond what's already generically covered by the shared `Issue` CRUD (the task explicitly scopes "VULNERABILITY findings" and says quality-gate writes remain out of scope — the shared handlers technically also accept `QUALITY_GATE_VIOLATION` since it's the same endpoint/shape in the contract, but no quality-gate-specific behavior is added).
- `apps/web` and `apps/web/src/domain/entities/Issue.ts` — untouched; already shape-identical to the API's mirrored type.
- Any persistence layer — data remains the in-memory `SEED_ISSUES` array, reset on restart, per the task.

## Verification

1. `npm run test:api` (or `npx vitest run src/app.test.ts` from `apps/api`) — all existing GET tests plus the new POST/PUT/DELETE suites should pass.
2. `npm run dev:api`, then manually exercise the CLI scripts end-to-end against `acme-payments`:
   - `npm run issues:add -- acme-payments scripts/examples/vulnerability.json` → expect `201` + `Location`.
   - `npm run issues:list -- acme-payments` → confirm the new issue appears.
   - `npm run issues:update -- acme-payments <new-id> scripts/examples/issue-update.json` → expect `200`, `status: RESOLVED`.
   - `npm run issues:remove -- acme-payments <new-id>` → expect `204`; re-run `issues:list` to confirm it's gone.
   - Repeat the add step with `scripts/examples/comment.json` to confirm COMMENT create still works (author set, severity/rule null).
3. `npm test` at the root to confirm `apps/web` tests are unaffected.
