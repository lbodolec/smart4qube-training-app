# Implement createIssue / updateIssue / deleteIssue in apps/api

## Context

`apps/api` currently implements only the two read operations of `contracts/openapi.yaml`'s `/issues` API (`listIssues`, `getIssue`); `POST`/`PUT`/`DELETE` all hit a shared `notImplemented` handler that always returns `501 NOT_IMPLEMENTED`, regardless of the request. The CLI scripts for adding/removing issues (`scripts/add-issue.sh`, `scripts/remove-issue.sh`) already exist and speak the correct contract, but currently always fail against the live API since the endpoints they hit are stubs.

The goal is to make these three write endpoints real, so that vulnerabilities (and, since they share one endpoint/data model, comments too) can actually be created, edited, and deleted through the API — turning this from a read-only stub into the training app's first fully functional CRUD slice. Per user decision, this work is API-only (`apps/api`); `apps/web` is untouched. Data stays in-memory (the existing `SEED_ISSUES` array) — no persistence layer is being added, so a server restart still resets everything.

Scope note: because `createIssue`/`updateIssue`/`deleteIssue` are one shared code path for all `Issue` types per the contract, the validation logic is written generically for all three types (`VULNERABILITY`, `QUALITY_GATE_VIOLATION`, `COMMENT`). `VULNERABILITY` and `COMMENT` are the priority for testing; `QUALITY_GATE_VIOLATION` is not specially rejected — it works through the same generic path but isn't a dedicated test focus.

## Implementation

### `apps/api/src/types.ts`

Add two new interfaces mirroring the contract's `NewIssue` and `IssueUpdate` schemas, alongside the existing `Issue` interface:

```ts
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
```

### `apps/api/src/app.ts`

Remove the `notImplemented` stub (no callers left once all three verbs are real). Keep `ErrorBody` and `toArray`.

**Shared helpers** (also used to refactor the two existing GET handlers so all five routes share one not-found implementation — behavior-preserving, same messages/codes):
- `isKnownProject(projectId)`, `sendProjectNotFound(res, projectId)`
- `findIssueIndex(projectId, issueId)`, `sendIssueNotFound(res, projectId, issueId)`

**Id / timestamp generation** (nothing like this exists yet):
- `computeInitialSeq(issues)` scans `SEED_ISSUES` for the max numeric suffix of `iss-NNN` ids at module load (currently resolves to 19) — avoids hardcoding a count that could drift if seed fixtures change.
- `issueSeq` is a module-level counter, incremented (never reused/recycled, even across deletes) by `nextIssueId()` → `iss-${seq.padStart(3,'0')}`, extending past 3 digits gracefully if needed.
- `new Date().toISOString()` for `createdAt`/`updatedAt` — same ISO-8601 UTC shape as seed data (the seed's literal `.000Z` was just authored on a whole second, not a required format).

**Field validators**: `isNonEmptyString`, `isPositiveInteger`, `isValidFilePath` (non-empty, no leading `/` — matches the one explicit contract rule, no full POSIX-grammar validation), `isValidRuleFormat` (`/^S\d+$/`).

**`checkTypeInvariant(type, severity, rule, author)`**: the one function shared by create and update that enforces "severity/rule non-null iff type≠COMMENT; author non-null iff type===COMMENT," returning a `details[]`-style array of human-readable violations (reusing the existing multi-error-collection convention from the query-validation code). For update, this runs against the **merged** view (patch field if present, else existing field) so that e.g. `PUT { type: 'COMMENT' }` on a `VULNERABILITY` issue is correctly caught as invariant-violating (its `severity`/`rule` aren't cleared and it has no `author`).

Design decision: an explicit `author: null` on a non-COMMENT create/update is treated as equivalent to omission (accepted); only a non-null `author` on a non-COMMENT issue is rejected. Symmetric with how `severity`/`rule` already use explicit `null` for the COMMENT state.

**`classifyExtraKeys(body, allowedKeys, rejectedKeys)`**: shared helper flagging any body key that's server-assigned/immutable (`"<field>: server-assigned field must not be supplied"` / `"...immutable field..."`) or simply not part of the schema at all (`"<field>: unknown field"`) — rejecting typos/unrecognized keys too, for clearer diagnostics in a training app.

**`POST /issues/:projectId`**:
1. 404 `PROJECT_NOT_FOUND` if project unknown (checked before any body validation).
2. Reject non-object bodies.
3. Collect `details[]` from: extra/server-assigned keys, required fields (`filePath`, `line`, `type`, `message` — each with its own shape check), `status` enum check (defaults to `OPEN` if absent).
4. Only if `type` itself is a valid enum member, additionally run `checkTypeInvariant` against the (possibly-invalid-shaped) `severity`/`rule`/`author` — skip this if `type` was missing/invalid, to avoid confusing cascades.
5. Any `details` → `400 INVALID_BODY`. Otherwise build the full `Issue` (id via `nextIssueId()`, `createdAt === updatedAt === now`, `severity`/`rule` forced `null` and `author` forced non-null only when `type === 'COMMENT'`), `push` to `SEED_ISSUES`, respond `201` with `Location: /issues/{projectId}/{id}` and the created issue body.

**`PUT /issues/:projectId/:issueId`**:
1. 404 checks (project, then issue) using the shared helpers.
2. Reject non-object body; reject empty body (`{}`) with `400 INVALID_BODY`.
3. `classifyExtraKeys` against immutable (`id`, `projectId`, `createdAt`, `author`) + unknown keys.
4. Per-supplied-field shape/enum checks (only for keys present in the patch — nothing is "required" in a patch).
5. If no shape errors: build the merged view (patch value if present, else existing) for `type`/`severity`/`rule`, with `author` always taken from the existing record (immutable), and run `checkTypeInvariant` on the merge.
6. Any errors → `400 INVALID_BODY`. Otherwise `Object.assign(existing, body, { updatedAt: now })` (mutate in place) and respond `200` with the updated issue.

Documented consequence worth calling out (emergent, not a bug): since `author` can never be supplied on update, an issue's `type` can never be changed to or from `COMMENT` via `updateIssue` — only between `VULNERABILITY` and `QUALITY_GATE_VIOLATION`, since those two share the "author must be null" requirement already satisfied.

**`DELETE /issues/:projectId/:issueId`**: 404 checks via the shared helpers, then `SEED_ISSUES.splice(idx, 1)`, respond `204` with no body.

**Optional hardening** (recommended, not required by the user's ask): add a small error-handling middleware before the catch-all 404 to turn a body-parser `SyntaxError` (malformed JSON) into a `400 INVALID_BODY` JSON response instead of Express's default HTML error page — the gap exists today but only becomes reachable once clients start POSTing/PUTting real bodies.

### `apps/api/src/app.test.ts`

Keep the two existing `describe('GET ...')` blocks untouched (their hardcoded counts like `toHaveLength(9)` must keep working regardless of later tests). Replace the `describe('write operations', ...)` block (currently 3 stub-501 tests) with real coverage:

- **createIssue**: success for `VULNERABILITY` (asserts `201`, `Location` shape, generated id shape via regex not literal value, `status` defaults to `OPEN`, then a follow-up `GET` on the `Location` URL and on the list confirming the mutation is visible); success for `COMMENT`; multi-field-missing rejection; server-assigned-field rejection (multiple at once); invalid `rule` format; invalid `filePath` (leading slash); non-COMMENT with non-null `author` rejected; non-COMMENT with explicit `author: null` accepted; COMMENT with non-null `severity` rejected; unknown project (proves project-check precedes body validation).
- **updateIssue**: success (create a fixture via POST first, then PATCH-like PUT, assert `200` + refreshed `updatedAt` + a follow-up GET confirms persistence); empty-body rejection; immutable-field-supplied rejection; unknown-key rejection; the type-invariant merge violation (`PUT { type: 'COMMENT' }` on a freshly-created `VULNERABILITY`, asserting it's rejected); not-found (issue, then project).
- **deleteIssue**: success (create via POST, delete, assert `204`, then GET detail → `404`, GET list no longer contains it); not-found (issue, then project).

Testing hygiene: every mutating test creates its own fresh fixture via `POST` first rather than relying on/disturbing the 19 seeded rows or other tests' side effects; generated ids are asserted by regex shape (`/^iss-\d+$/`), never a hardcoded literal, since the exact next id is order-dependent.

### `scripts/update-issue.sh` (new)

Add for parity with `add-issue.sh`/`remove-issue.sh`, following their exact bash+curl+jq conventions (`SMART4QUBE_API_URL` env override, temp file + status-code check, `jq`/`cat` pretty-print, non-zero exit unless `200`):

```
Usage: scripts/update-issue.sh <projectId> <issueId> <path/to/patch.json>
```

Add `scripts/examples/issue-update.json` (e.g. `{"status": "RESOLVED"}`) as a sample patch body, referenced from the script's usage text.

### Documentation updates

- **`apps/api/CLAUDE.md`**: replace the "Implemented vs. contract-only behavior" section — all five operations are now implemented; note the explicit design decisions (unknown-key rejection, `author: null`-as-omission, `type` can't change to/from `COMMENT` via update); note the id scheme and that storage is still purely in-memory (no persistence added, restart resets state).
- **Root `README.md`**: update the "Stub coverage" section — all operations implemented, update the table's "Stub behavior" column accordingly (or replace the table with a short "fully implemented" note).
- **Root `CLAUDE.md`**: update the "Repository boundaries" bullet referencing the stub-coverage table (no longer a meaningful "subset" once everything's implemented) and drop the now-stale parenthetical in "Contract requirements".

## Verification

1. `npm run test:api` (or `npx vitest run src/app.test.ts` from `apps/api`) — all new/replaced tests pass, and the two untouched `GET` describe blocks keep passing unchanged.
2. Manual smoke test via the CLI scripts against the running dev API (`npm run dev:api`):
   - `scripts/add-issue.sh acme-payments scripts/examples/vulnerability.json` → expect `201` and a printed created issue.
   - `scripts/list-issues.sh acme-payments` → confirm the new issue appears.
   - `scripts/update-issue.sh acme-payments <new-id> scripts/examples/issue-update.json` → expect `200` with `status: RESOLVED`.
   - `scripts/remove-issue.sh acme-payments <new-id>` → expect success message; re-run `list-issues.sh` to confirm it's gone.
   - Repeat `add-issue.sh` with `scripts/examples/comment.json` to confirm COMMENT create also works end-to-end.
3. Confirm a restart of `npm run dev:api` resets state back to the 19 seeded issues (verifying no persistence was accidentally introduced).
