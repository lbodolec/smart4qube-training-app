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

Run a single test file from a workspace dir, e.g. `cd apps/api && npx vitest run src/app.test.ts`.

## Repository boundaries

- `apps/api` and `apps/web` are independent npm workspaces (own `package.json`, `tsconfig.json`); `contracts/openapi.yaml` at the root is shared by both.
- `apps/api`'s implemented-vs-stubbed operations are documented in the README's stub coverage table — check it before assuming a write endpoint works.
- `apps/web/fixtures/repos/**` are static sample repositories bundled into the web app for the code viewer/file tree; they are not real dependencies and are unrelated to `apps/api` or `apps/web`'s own source.

## Architecture

**Contract-first**: `contracts/openapi.yaml` is the source of truth for the `Issue` shape and the `/issues` API. `apps/api/src/types.ts` and `apps/web/src/domain/entities/Issue.ts` both mirror it independently — keep them in sync by hand when the contract changes.

See [apps/api/CLAUDE.md](apps/api/CLAUDE.md) and [apps/web/CLAUDE.md](apps/web/CLAUDE.md) for per-workspace architecture.
