# Integration hand-off

- **Backend:** `services/api`; `npm run dev -w @petanque/api`; port `3001`; build `npm run build -w @petanque/api`; health `GET /health`.
- **Frontend:** `services/web`; dev `npm run dev -w @petanque/web`; build `npm run build -w @petanque/web`; live game transport is Socket.IO `room:join` / `game:throw`; API requests and Socket.IO use the Vite same-origin proxy to `http://localhost:3001` by default, with `VITE_API_URL` available for direct deployments.
- **Mock files:** None. Frontend is wired directly to the live API; no mock datasets or preview state.
- **Routes:** `GET /health`; `POST /api/rooms`; Socket.IO `room:join`, `game:throw-jack`, `game:throw` (room events `game:state`, `player:connected`, `player:disconnected`).
- **Database:** SQLite via `better-sqlite3`, file `./data/petanque.sqlite` relative to repository root; `DATABASE_PATH` override. SQL migrations in `services/api/migrations/`, tracked in `schema_migrations`; includes persistent action receipts for duplicate-action rejection; no seed data.
- **Shared types:** no shared package currently; game types are in `services/api/src/game.ts` and mirrored in the frontend.
- **Services:** Game frontend (Essential); authoritative realtime game backend (Essential).
