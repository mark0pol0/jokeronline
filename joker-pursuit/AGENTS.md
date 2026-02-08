# AGENTS.md - Joker Pursuit

These instructions are for Codex agents working in this repository.

## 0) Project Orientation

### What this codebase is
- A React + TypeScript implementation of Joker Pursuit with both local play and online multiplayer.
- Frontend is a CRA app in repo root (`src/`).
- Backend is a Socket.IO + Express TypeScript service in `server/src/`.
- Online play currently supports a modern V2 protocol with graceful reconnect and a legacy V1 protocol kept for rollback compatibility.

### High-level architecture
- UI entry: `src/index.tsx`
  - wraps app in `SocketProvider` then `MultiplayerProvider`.
- App router/state shell: `src/App.tsx`
  - phases: `home`, `setup`, `playing`, `online`, `online-playing`.
  - `?room=CODE` deep-links directly into online join flow.
- Local game controller: `src/components/Game/GameController.tsx`.
- Online lobby + room join/create views:
  - `src/components/Multiplayer/OnlineMenu.tsx`
  - `src/components/Multiplayer/CreateGameRoom.tsx`
  - `src/components/Multiplayer/JoinGameRoom.tsx`
- Online in-game shell:
  - `src/components/Multiplayer/MultiplayerGameController.tsx`
  - handles snapshot application, optimistic UI coordination, and action submit/sync orchestration.

### Network + session model (critical)
- Socket connection lifecycle is managed in `src/context/SocketContext.tsx`.
  - production requires `REACT_APP_SOCKET_URL` unless user manually configures URL in UI.
  - local defaults to `http://localhost:8080`.
- Multiplayer session state is centralized in `src/context/MultiplayerContext.tsx`.
  - source of truth for `roomCode`, `playerId`, `sessionToken`, `players`, `playersPresence`, `stateVersion`.
  - persists session tokens in `localStorage` using `joker-pursuit.session.<ROOMCODE>`.
  - supports auto-rejoin via stored session + `?room=...`.
- Protocol client wrappers are in `src/services/multiplayerProtocolV2.ts`.
  - all socket emits use ack + timeout via `emitWithAck`.

### Backend model (critical)
- Main server entry: `server/src/index.ts`.
  - V2 events: `create-room-v2`, `join-room-v2`, `rejoin-room-v2`, `start-game-v2`, `update-player-color-v2`, `submit-action-v2`, `request-sync-v2`, `leave-room-v2`.
  - snapshot/presence broadcasts: `room-snapshot-v2`, `presence-updated-v2`, `host-updated-v2`, `player-joined-v2`.
  - reconnect grace controlled by `DISCONNECT_GRACE_MINUTES`.
- Room/session persistence abstraction:
  - `server/src/store/RoomStore.ts`
  - `server/src/store/InMemoryRoomStore.ts`
  - `server/src/store/RedisRoomStore.ts`
- If `REDIS_URL` is not configured, server falls back to in-memory store.

### Game logic layout
- Core models/rules:
  - `src/models/*`
  - `src/utils/MovementUtils.ts`
- `GameController` and multiplayer controller both rely on shared model/rule semantics.
- Be careful with board serialization differences (`Map` vs object) when moving state over network; this normalization is handled in `MultiplayerGameController`.

### Deploy context for this repo
- Frontend: Vercel project `jokeronline`.
- Backend: Render service `srv-d3in5eali9vc73evh86g` (`jokeronline`).
- Config files:
  - `vercel.json`
  - `render.yaml`
  - `.env.production.example`

### Useful commands
1. Client dev: `npm start`
2. Server dev: `npm run server` or `cd server && npm run dev`
3. Client build: `npm run build`
4. Server build: `cd server && npm run build`
5. Targeted tests: `npm test -- --watchAll=false --runTestsByPath <path>`
6. Harness:
   - `npm run harness`
   - `npm run harness:offline`
   - `npm run harness:online`

### Known pitfalls in this codebase
- A URL room code (`?room=...`) does not mean a player has joined.
- Join/waiting-room UI must gate on valid session identity, not room code alone.
- Do not regress V1/V2 compatibility toggles unless explicitly requested.
- Do not break monotonic snapshot/state-version handling in online game flow.
- Do not remove reconnect/session persistence behavior unless asked.
- Ignore backup artifacts unless user explicitly asks to use them:
  - `*.bak`, `*.backup`, `*.sedbackup`, swap files.

## 1) Diagnose Before Fixing

Do not jump straight to edits.

For any non-trivial bug:
1. Find and read the real source files first.
2. Trace the full flow before changing code.
3. State a one-sentence diagnosis before implementing.

For multiplayer issues, trace this path:
1. `src/App.tsx`
2. `src/components/Multiplayer/*`
3. `src/context/SocketContext.tsx`
4. `src/context/MultiplayerContext.tsx`
5. `src/services/multiplayerProtocolV2.ts`
6. `server/src/index.ts`

## 2) Scope Control

- Implement only what the user asked for.
- Avoid unrelated refactors/cleanup.
- Do not remove safety logic unless you replace it with equivalent behavior.
- Keep edits minimal and localized.

## 3) Multiplayer Guardrails

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
