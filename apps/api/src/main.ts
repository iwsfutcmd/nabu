/**
 * Runs the API. The database is Postgres when DATABASE_URL is set; otherwise
 * PGlite in NABU_PGLITE (a directory, or "memory"), defaulting to .data/pglite
 * so `pnpm dev` needs no database server.
 *
 * Per-instance options (gameplan §12):
 *   NABU_LEAGUES=1              weekly leagues (off by default)
 *   NABU_PUSH=1                 practice reminders by Web Push (off by default)
 *   NABU_VAPID_SUBJECT          mailto: or https: contact for push services
 *   NABU_VAPID_PRIVATE_JWK      VAPID key (else generated once and kept in the database)
 *   NABU_TEST_HOOKS=1           test-only routes: a push sink and a job runner (never in production)
 */
import { serve } from "@hono/node-server";
import { DEFAULT_LEAGUE } from "@nabu/core/game";
import { createAccounts } from "./accounts.ts";
import { createApp } from "./app.ts";
import { openDatabase } from "./db/index.ts";
import { rollover } from "./leagues.ts";
import { sendReminders } from "./reminders.ts";
import { sendPush, vapidKeys, type Vapid } from "./webpush.ts";

const port = Number(process.env["PORT"] ?? 8787);
const on = (name: string): boolean => process.env[name] === "1";
const { db, close } = await openDatabase({ url: process.env["DATABASE_URL"], pglite: process.env["NABU_PGLITE"] ?? ".data/pglite" });

const leagues = on("NABU_LEAGUES") ? DEFAULT_LEAGUE : undefined;
let vapid: Promise<Vapid> | undefined;
const keys = on("NABU_PUSH") ? () => (vapid ??= vapidKeys(db, process.env["NABU_VAPID_SUBJECT"] ?? "mailto:nabu@localhost")) : undefined;

const app = createApp({ db, accounts: createAccounts(db), leagues, vapid: keys });

/** The periodic jobs: league rollover and reminders. */
const runJobs = async (now: number): Promise<{ rolled: readonly string[]; sent: number }> => {
  const rolled = leagues === undefined ? [] : await rollover(db, now, leagues);
  let sent = 0;
  if (keys !== undefined) {
    const v = await keys();
    sent = (await sendReminders(db, now, (sub, payload) => sendPush(sub, payload, v, now, (url, init) => fetch(url, init)))).sent;
  }
  return { rolled, sent };
};

if (on("NABU_TEST_HOOKS")) {
  // A push service stand-in and a way to run the jobs at a chosen time, for end-to-end tests.
  const received = new Map<string, Uint8Array[]>();
  app.post("/test/push/:id", async (c) => {
    received.set(c.req.param("id"), [...(received.get(c.req.param("id")) ?? []), new Uint8Array(await c.req.arrayBuffer())]);
    return c.body(null, 201);
  });
  app.get("/test/push/:id", (c) => c.json({ messages: (received.get(c.req.param("id")) ?? []).map((b) => Buffer.from(b).toString("base64url")) }));
  app.post("/test/jobs", async (c) => c.json(await runJobs(Number(c.req.query("now") ?? Date.now()))));
} else if (leagues !== undefined || keys !== undefined) {
  const tick = (): void => void runJobs(Date.now()).catch((e: unknown) => console.error("jobs", e));
  setInterval(tick, 5 * 60_000).unref();
}

const server = serve({ fetch: app.fetch, port }, (info) => console.log(`api listening on http://localhost:${info.port}`));

const shutdown = (): void => {
  server.close();
  void close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
