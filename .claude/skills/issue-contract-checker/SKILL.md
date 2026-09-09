---
name: issue-contract-checker
description: Detects drift between the Issue-related enums (IssueType, IssueSeverity, IssueStatus, and any other enum whose name starts with "Issue") defined in contracts/openapi.yaml, apps/api/src/types.ts, and apps/web/src/domain/entities/Issue.ts. Use this whenever you add, rename, or remove a value in one of those enums, before shipping any Smart4Qube feature that touches issue status/severity/type, or whenever asked to check, verify, or sync the issue contract across the API spec, backend types, and frontend domain model. Also useful as a quick pre-PR sanity check for any change that touches contracts/openapi.yaml.
---

# Issue Contract Checker

Smart4Qube defines the same set of "Issue" enums in three independent places:

- `contracts/openapi.yaml` — the OpenAPI schema, source of truth for the wire format
- `apps/api/src/types.ts` — the backend's TypeScript types
- `apps/web/src/domain/entities/Issue.ts` — the frontend's TypeScript types

Nothing keeps these three in sync automatically. A value added to one and forgotten in another produces runtime failures that are annoying to trace back to their cause (a 400 from the API that the frontend never expected, or a frontend value the backend silently rejects). This check exists to catch that class of bug immediately, deterministically, before it ships.

## When to run it

- After editing any enum in `contracts/openapi.yaml`, `apps/api/src/types.ts`, or `apps/web/src/domain/entities/Issue.ts`
- Before opening a PR that touches issue types, severities, or statuses
- Any time you're asked to verify, check, or sync the issue contract

## How to run it

```bash
python3 .claude/skills/issue-contract-checker/scripts/check-issue-contract.py
```

Run it from the repo root. It exits `0` when everything matches and non-zero otherwise, so it's safe to wire into a pre-commit hook or CI step:

```bash
python3 .claude/skills/issue-contract-checker/scripts/check-issue-contract.py || exit 1
```

### Expected output — everything in sync

```
Issue Contract Checker
=======================

Checking enum: IssueSeverity
  contracts/openapi.yaml: BLOCKER, CRITICAL, INFO, MAJOR, MINOR
  apps/api/src/types.ts: BLOCKER, CRITICAL, INFO, MAJOR, MINOR
  apps/web/src/domain/entities/Issue.ts: BLOCKER, CRITICAL, INFO, MAJOR, MINOR
  OK

Checking enum: IssueStatus
  contracts/openapi.yaml: CONFIRMED, FALSE_POSITIVE, OPEN, RESOLVED
  apps/api/src/types.ts: CONFIRMED, FALSE_POSITIVE, OPEN, RESOLVED
  apps/web/src/domain/entities/Issue.ts: CONFIRMED, FALSE_POSITIVE, OPEN, RESOLVED
  OK

Checking enum: IssueType
  contracts/openapi.yaml: COMMENT, QUALITY_GATE_VIOLATION, VULNERABILITY
  apps/api/src/types.ts: COMMENT, QUALITY_GATE_VIOLATION, VULNERABILITY
  apps/web/src/domain/entities/Issue.ts: COMMENT, QUALITY_GATE_VIOLATION, VULNERABILITY
  OK

Summary: 0 mismatch(es) found across 3 enum(s) checked.
Note: matching enums does not prove full API compliance — this check only catches enum drift.
```

### Expected output — a mismatch

If, say, `apps/api/src/types.ts` has `CLOSED` where the other two files still say `RESOLVED`:

```
Checking enum: IssueStatus
  contracts/openapi.yaml: CONFIRMED, FALSE_POSITIVE, OPEN, RESOLVED  <- missing: CLOSED
  apps/api/src/types.ts: CLOSED, CONFIRMED, FALSE_POSITIVE, OPEN  <- missing: RESOLVED; extra: CLOSED
  apps/web/src/domain/entities/Issue.ts: CONFIRMED, FALSE_POSITIVE, OPEN, RESOLVED  <- missing: CLOSED
  MISMATCH in IssueStatus

Summary: 1 mismatch(es) found across 3 enum(s) checked.
```

`missing: X` on a file means value `X` exists in at least one of the other files but not here. `extra: X` means this file has a value the others don't. The process exits `1`.

## What it actually checks — and what it doesn't

This is a narrow, deterministic check: it extracts the *value sets* of every enum whose name starts with `Issue` from each of the three files and compares them. That's it. A passing run means the three files agree on which string values are valid for `IssueType`, `IssueSeverity`, `IssueStatus`, etc.

It does **not** prove full API compliance. It won't catch:
- A field that's required in one schema but optional in another
- A response shape mismatch unrelated to enums
- Runtime behavior that diverges from the documented contract

Treat a passing run as "the enums agree," not "the contract is fully honored." For deeper API compliance, pair this with contract/integration tests.

## How the script works (and its limits)

`scripts/check-issue-contract.py` has zero dependencies — no PyYAML or TS parser library — by design, so it runs anywhere `python3` runs with no install step.

- **YAML side**: a small line-based scanner that understands standard OpenAPI block structure. It finds a key line with nested content (e.g. `IssueStatus:`), then looks for an `enum:` key directly beneath it, in either flow style (`enum: [A, B, C]`) or block style (`enum:\n  - A\n  - B`). It is not a general-purpose YAML parser — it assumes 2-space-ish consistent indentation and that `enum:` sits directly under the schema name, which is how OpenAPI schemas are normally written.
- **TypeScript side**: regex-based. It matches `export type Name = "a" | "b" | ...;` union aliases (how this repo declares Issue enums) and, for forward-compatibility, `export enum Name { A = "a", ... }`. It only picks up string-literal values (numeric enums are ignored, since Issue enums here are always string-backed).
- **Scope**: only enum/type names matching `/^Issue/i` are compared, by design — this keeps the check focused on the Issue contract instead of flagging unrelated enum drift elsewhere in the same files.

If a new Issue-related file is added, or the enum naming convention changes, adjust `DEFAULT_TARGETS` or `ENUM_NAME_PATTERN` at the top of the script. You can also point it at different files without editing it:

```bash
python3 .claude/skills/issue-contract-checker/scripts/check-issue-contract.py \
  --root /path/to/other/checkout \
  --file contracts/openapi.yaml \
  --file apps/api/src/types.ts \
  --file apps/web/src/domain/entities/Issue.ts
```

## Verifying the checker still works

If you change the script itself, sanity-check it before trusting it again:

1. Run it as-is and confirm it passes on the current checkout.
2. Temporarily change one enum value in exactly one of the three files (e.g. rename `RESOLVED` to `CLOSED` in `apps/api/src/types.ts`).
3. Run it again — confirm it reports the specific file, enum, and differing values, and exits non-zero.
4. Revert the temporary change (`git checkout -- <file>` if the repo is clean, or restore from your own backup) and confirm the checker passes again with exit code 0.
