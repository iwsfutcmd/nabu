/**
 * The API (gameplan §14.1). Learners without an account never call it except
 * for bundles; with one, devices upload their event logs and read them back.
 *
 *   GET  /healthz
 *   GET  /v0/ui-locale                 negotiated UI locale
 *   POST /v1/auth/sign-up              {email, password} → {user, token}
 *   POST /v1/auth/sign-in              {email, password} → {user, token}
 *   POST /v1/auth/sign-out
 *   GET  /v1/auth/me
 *   POST /v1/events                    {events: LearnerEvent[]} → {accepted, duplicates, cursor}
 *   GET  /v1/events?since=<cursor>&limit=<n>   → {events, cursor, more}
 *   GET  /v1/state?course=<id>         → {course, events, state}: the replayed projection
 *
 * Authenticated routes take `Authorization: Bearer <token>`. No cookies, so
 * any origin may call it (CORS *) without exposing a session to CSRF.
 */
import { DEFAULT_UI_LOCALE, directionOf, negotiateLocale, PSEUDO_LOCALES, UI_LOCALES } from "@nabu/i18n";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { Account, Accounts } from "./accounts.ts";
import type { Db } from "./db/index.ts";
import { append, checkBatch, MAX_BATCH, since, stateOf } from "./log.ts";

export interface AppDeps {
  readonly db: Db;
  readonly accounts: Accounts;
}

type Env = { Variables: { user: Account; token: string } };

const credentials = async (c: Context): Promise<{ email: string; password: string } | undefined> => {
  const body: unknown = await c.req.json().catch(() => undefined);
  if (typeof body !== "object" || body === null) return undefined;
  const { email, password } = body as { email?: unknown; password?: unknown };
  return typeof email === "string" && typeof password === "string" ? { email, password } : undefined;
};

const bearer = (header: string | undefined): string | undefined => (header?.startsWith("Bearer ") === true ? header.slice(7) : undefined);

/** Health and locale negotiation: no database needed. */
export const publicRoutes = new Hono()
  .get("/healthz", (c) => c.json({ ok: true }))
  /** Which UI locale this server would serve: ?ui= (the user's setting), then Accept-Language. */
  .get("/v0/ui-locale", (c) => {
    const negotiated = negotiateLocale({
      userSetting: c.req.query("ui"),
      accepted: c.req.header("accept-language"),
      available: UI_LOCALES,
      pseudo: PSEUDO_LOCALES,
      defaultLocale: DEFAULT_UI_LOCALE,
    });
    c.header("Vary", "Accept-Language");
    c.header("Content-Language", negotiated.locale);
    return c.json({ ...negotiated, dir: directionOf(negotiated.locale) });
  });

export const createApp = ({ db, accounts }: AppDeps) => {
  const app = new Hono<Env>();
  app.use("/v1/*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST"], maxAge: 600 }));
  app.route("/", publicRoutes);

  app.post("/v1/auth/sign-up", async (c) => {
    const body = await credentials(c);
    if (body === undefined) return c.json({ error: "invalid-request" }, 400);
    const result = await accounts.signUp(body.email, body.password);
    return result.ok ? c.json(result.value, 201) : c.json({ error: result.error }, result.error === "email-taken" ? 409 : 400);
  });

  app.post("/v1/auth/sign-in", async (c) => {
    const body = await credentials(c);
    if (body === undefined) return c.json({ error: "invalid-request" }, 400);
    const result = await accounts.signIn(body.email, body.password);
    return result.ok ? c.json(result.value) : c.json({ error: result.error }, 401);
  });

  // Everything below needs a signed-in user.
  app.use("/v1/*", async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    const token = bearer(c.req.header("authorization"));
    const user = token === undefined ? undefined : await accounts.userOf(token);
    if (token === undefined || user === undefined) return c.json({ error: "unauthorized" }, 401);
    c.set("user", user);
    c.set("token", token);
    return next();
  });

  app.post("/v1/auth/sign-out", async (c) => {
    await accounts.signOut(c.get("token"));
    return c.body(null, 204);
  });

  app.get("/v1/auth/me", (c) => c.json({ user: c.get("user") }));

  app.post("/v1/events", async (c) => {
    const user = c.get("user").id;
    const checked = checkBatch(await c.req.json().catch(() => undefined), user);
    if (!checked.ok) return c.json({ error: checked.error }, 400);
    return c.json(await append(db, user, checked.events));
  });

  app.get("/v1/events", async (c) => {
    const after = Number(c.req.query("since") ?? 0);
    const limit = Number(c.req.query("limit") ?? MAX_BATCH);
    if (!Number.isSafeInteger(after) || after < 0) return c.json({ error: "invalid-cursor" }, 400);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH) return c.json({ error: "invalid-limit", max: MAX_BATCH }, 400);
    return c.json(await since(db, c.get("user").id, after, limit));
  });

  app.get("/v1/state", async (c) => {
    const course = c.req.query("course");
    if (course === undefined || course === "") return c.json({ error: "missing-course" }, 400);
    return c.json({ course, ...(await stateOf(db, c.get("user").id, course)) });
  });

  return app;
};

export type App = ReturnType<typeof createApp>;
