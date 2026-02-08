# AGENTS.md - Joker Pursuit

These instructions are for Codex agents working in this repository.

## 1) Diagnose Before Fixing

Do not jump straight to edits.

For any non-trivial bug:
1. Find and read the real source files first.
2. Trace the full flow before changing code.
3. State a one-sentence diagnosis before implementing.

For multiplayer issues, trace this path:
- `src/App.tsx`
- `src/components/Multiplayer/*`
- `src/context/MultiplayerContext.tsx`
- `src/services/multiplayerProtocolV2.ts`
- `server/src/index.ts`

## 2) Scope Control

- Implement only what the user asked for.
- Avoid unrelated refactors/cleanup.
- Do not remove safety logic unless you replace it with equivalent behavior.
- Keep edits minimal and localized.

## 3) Multiplayer Guardrails

- A URL room code (`?room=...`) is not proof the user joined.
- Treat a user as joined only when session identity is valid (room code + player/session identity).
- Preserve V1/V2 compatibility flags unless explicitly requested.
- Keep snapshot/version behavior monotonic; do not regress stale-state protections.
- Keep leave/rejoin behavior consistent with local session storage handling.

## 4) Validation Requirements

After code changes, validate before finishing:
1. Run targeted tests for changed behavior when possible.
2. Run client build: `npm run build`
3. If server code changed, run server build: `cd server && npm run build`

If any step fails, report the failure and reason clearly.

## 5) Completion Workflow (Default)

Unless the user explicitly says otherwise, complete all steps:
1. Commit intended files only.
2. Push the branch to `origin`.
3. Deploy frontend to Vercel (production).
4. Deploy backend to Render (production).

Standard deploy commands in this repo:
- Vercel: `vercel --prod --yes`
- Render: `render --confirm deploys create srv-d3in5eali9vc73evh86g --wait --output text`

Do not stage generated artifacts like `reports/` unless explicitly requested.

## 6) Final Status Reporting

Include all of the following in the final response:
1. Commit hash and message.
2. Branch + push target.
3. Vercel deployment URL (or exact blocker).
4. Render deploy ID/status and service URL (or exact blocker).
