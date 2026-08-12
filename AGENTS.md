# AGENTS.md

## Cursor Cloud specific instructions

### Services & how to run
- This repo is a single Node/Express app (`yourlabpt-website`). **One process on port 3000 serves everything**: the marketing site (`/`), the lead-capture chat API (`/api/chat`), the admin dashboard (`/admin/`), and the requirements/projects platform (`/projects`, `/api/projects/*`). There is no separate backend.
- Dependencies live in **two** places and both are installed by the startup update script: the repo root (`better-sqlite3`, `multer`) and `server/` (express, nodemon, openai, etc.).
- Run the app from `server/`: `npm run dev` (nodemon, auto-reload) or `npm start` (plain). See `server/start.sh`, but note it only installs `server/` deps — the root deps must also be installed.
- Health check: `GET http://localhost:3000/api/health`.

### Non-obvious caveats
- **Chat has no external dependency.** `CHAT_MODE=auto` (default) tries a local Ollama server and silently falls back to a pure-JS offline lead bot. Ollama and SMTP are **optional**; nothing external is required. When running/testing the chat, prefer `CHAT_MODE=offline` (e.g. `CHAT_MODE=offline npm run dev`) to skip Ollama connection attempts. In offline mode the lead bot intentionally responds with quick-reply category prompts to qualify the lead — repeated clarifying questions are expected behavior, not a bug.
- On startup the projects platform migrates/repairs data into SQLite under `projects/data/` (git-ignored). This writes files, which triggers a one-time `nodemon` restart — expected.
- Config is loaded from `server/.env` (git-ignored). `server/.env.example` documents all keys; defaults work without a `.env` file. Admin dashboard default password is `yourlab-admin`.

### Testing
- No lint script is defined.
- Unit tests: `npm run test:unit` (`node --test`). E2E: `npm run test:e2e` (Playwright, Chromium; browser is installed by the update script). `npm run test:all` runs both.
- Two tests fail on a clean checkout and are **not** caused by environment setup (do not chase them as regressions):
  - `projects/tests/citypass-agent-runtime.test.js` ("produces YAR job payload…") reads an execution-plan blob under `projects/data/blobs/`, which is git-ignored and absent on a fresh clone, so `task.instruction` is undefined.
  - `projects/tests/browser/work-items-orchestration-ui.spec.js` ("preserves agent log scroll") fails on `.ado-agent-log-list` visibility — a pre-existing app/test issue.
