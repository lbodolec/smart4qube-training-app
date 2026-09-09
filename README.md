# Smart4Qube

A SonarQube-like code review viewer: browse sample repositories, and read
line-anchored vulnerabilities, quality gate violations, and comments.

## Quickstart

Run the API and web app in separate terminals:

```
npm install
npm run dev:api    # http://localhost:3001
npm run dev:web    # http://localhost:5173
```

Then open http://localhost:5173.

## Stub coverage

`apps/api` implements every operation in `contracts/openapi.yaml`. Data is
still held in a single in-memory array (`apps/api/src/seed.ts`) — there is
no persistence layer, so restarting the API resets all writes back to the
seeded fixtures.

| Operation | Path | Behavior |
|---|---|---|
| `listIssues` | `GET /issues/{projectId}` | Implemented |
| `getIssue` | `GET /issues/{projectId}/{issueId}` | Implemented |
| `createIssue` | `POST /issues/{projectId}` | Implemented |
| `updateIssue` | `PUT /issues/{projectId}/{issueId}` | Implemented |
| `deleteIssue` | `DELETE /issues/{projectId}/{issueId}` | Implemented |
