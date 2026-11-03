/**
 * Runs the API. The database is Postgres when DATABASE_URL is set; otherwise
 * PGlite in NABU_PGLITE (a directory, or "memory"), defaulting to .data/pglite
 * so `pnpm dev` needs no database server.
 */
import { serve } from "@hono/node-server";
import { createAccounts } from "./accounts.ts";
import { createApp } from "./app.ts";
import { openDatabase } from "./db/index.ts";

const port = Number(process.env["PORT"] ?? 8787);
const { db, close } = await openDatabase({ url: process.env["DATABASE_URL"], pglite: process.env["NABU_PGLITE"] ?? ".data/pglite" });
const app = createApp({ db, accounts: createAccounts(db) });
const server = serve({ fetch: app.fetch, port }, (info) => console.log(`api listening on http://localhost:${info.port}`));

const shutdown = (): void => {
  server.close();
  void close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
