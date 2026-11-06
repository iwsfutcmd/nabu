# 0068. Self-hosting with Docker Compose

- Status: Proposed
- Date: 2026-11-06
- Amends: gameplan §14.5

## Context

Phase 11 asks for an instance anyone can run: the app, the API and its database, over HTTPS, from
one configuration file, checked in CI. Until now `deploy/` was a placeholder, and the only running
Nabu was the local-only demo on GitHub Pages.

## Decision

**`deploy/compose.yaml`:** Postgres, the API, and Caddy serving the web app.
- **Optional profiles:** Ollama (`llm`) and the speech service (`speech`).
- **Configuration:** one `deploy/.env` (`.env.example` lists every setting). An empty setting
  counts as unset.

**One origin.** Caddy serves the app and proxies `/v1`, `/admin/v1`, `/v0` and `/healthz` to the
API.
- **The build:** the web image is built with `VITE_NABU_API=/`, which the app reads as "this
  origin". So one image serves any domain, and the API needs no CORS for its own app.
- **HTTPS:** Caddy gets the certificate (its own CA for `localhost`).
- **Client addresses:** Caddy passes them on, so the abuse limits see real ones
  (`NABU_TRUST_PROXY=1`).

**The API image keeps the workspace's layout.** Node runs the workspace's TypeScript as source
(ADR 0013), but never TypeScript inside `node_modules`.
- **So:** the image is the repository (`.dockerignore` drops the heavy parts) with
  `pnpm install --prod --filter @nabu/api...`. That links the workspace packages from outside
  `node_modules`.
- **Not used:** `pnpm deploy`, which would copy them inside it.

**No object store,** unlike the gameplan's sketch.
- **Bundles:** they are static files, so they ship in the web image.
- **Recordings:** they are never stored (§10.4).
- **The rest:** everything else an instance knows lives in Postgres.

**Checked in CI.** A job builds the images, starts the stack and runs `deploy/smoke.sh` through
Caddy over HTTPS: sign up, upload a session, read it back, export the account, delete it. The same
flow through the app's interface runs in the e2e suite against the dev server.

## Consequences

- **Running an instance:** a server with Docker, a domain, and `docker compose up`.
  `deploy/README.md` covers backups (`pg_dump`), restores and upgrades. Migrations run on start.
- **Not built in CI:** the speech image (several gigabytes).
- **Not published:** images to a registry. An instance builds its own.
- **One API process:** the abuse limits count in its memory (ADR 0067).
