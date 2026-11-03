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
 *   GET  /v1/profile                   → {profile}            PUT {username, displayName?, uiLocale?}
 *   GET  /v1/league                    → this week's cohort, or {enabled: false} (leagues are opt-in)
 *   GET  /v1/push/key                  → {publicKey}: the VAPID key for pushManager.subscribe
 *   POST /v1/push/subscribe            {endpoint, keys: {p256dh, auth}}
 *   POST /v1/push/unsubscribe          {endpoint}
 *   /v1/ai/*                           the AI features (ai/routes.ts), when the instance has a model
 *   /v1/speech/*                       speech scoring, tiers 1–2 (speech.ts), with a speech service
 *
 * Review (NABU_ADMIN_TOKEN as the bearer token):
 *   GET  /admin/v1/reports?status=&course=       the review queue
 *   GET  /admin/v1/reports.jsonl?status=approved  what `nabu reports promote` reads
 *   POST /admin/v1/reports/:id                    {status: approved | rejected | promoted}
 *
 * Authenticated routes take `Authorization: Bearer <token>`. No cookies, so
 * any origin may call it (CORS *) without exposing a session to CSRF.
 */
import { DEFAULT_UI_LOCALE, directionOf, negotiateLocale, PSEUDO_LOCALES, UI_LOCALES } from "@nabu/i18n";
import { timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { DEFAULT_GAME, type GameConfig, type LeagueConfig } from "@nabu/core/game";
import type { EvalGate, ReportStatus } from "@nabu/schema";
import { and, eq } from "drizzle-orm";
import type { Account, Accounts } from "./accounts.ts";
import type { Courses } from "./ai/courses.ts";
import type { Gateway } from "./ai/gateway.ts";
import { aiRoutes } from "./ai/routes.ts";
import type { Transport } from "./ai/providers.ts";
import { speechRoutes } from "./speech.ts";
import type { Db } from "./db/index.ts";
import { pushSubscriptions } from "./db/schema.ts";
import { joinIfActive, leagueView } from "./leagues.ts";
import { append, checkBatch, existing, gameStateOf, MAX_BATCH, since, stateOf } from "./log.ts";
import { getProfile, setProfile } from "./profiles.ts";
import { fileReport, listReports, setStatus, STATUSES } from "./reports.ts";
import { base64url, fromBase64url, type Vapid } from "./webpush.ts";

export interface AppDeps {
  readonly db: Db;
  readonly accounts: Accounts;
  /** Leagues, when this instance opts in (§12.4). */
  readonly leagues?: LeagueConfig | undefined;
  /** VAPID keys, when this instance sends reminders (§12.6). */
  readonly vapid?: (() => Promise<Vapid>) | undefined;
  /** The clock (tests fix it). */
  readonly now?: (() => number) | undefined;
  /** The LLM gateway, courses and judge gates (Phase 8). Reports need them too, with or without a model. */
  readonly ai?: { readonly gateway: Gateway; readonly courses: Courses; readonly gates: readonly EvalGate[] } | undefined;
  /** The reviewers' bearer token for /admin/v1 (unset: no review endpoints). */
  readonly adminToken?: string | undefined;
  /** The game rules (§12): the deployment's game.json, as the web app gets it (default DEFAULT_GAME). */
  readonly game?: GameConfig | undefined;
  /** The speech service (Phase 9): its URL and how to reach it. Needs `ai` for courses and hashing. */
  readonly speech?: { readonly url: string | undefined; readonly transport: Transport; readonly budget?: number } | undefined;
}

export type Env = { Variables: { user: Account; token: string } };

const sameSecret = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

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

const body = async (c: Context): Promise<Record<string, unknown> | undefined> => {
  const value: unknown = await c.req.json().catch(() => undefined);
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
};

/** A push subscription's keys must be a P-256 point and a 16-byte secret, both base64url. */
const validSubscription = (b: Record<string, unknown>): { endpoint: string; p256dh: string; auth: string } | undefined => {
  const { endpoint, keys } = b as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || typeof keys?.p256dh !== "string" || typeof keys.auth !== "string") return undefined;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost"))) return undefined;
  } catch {
    return undefined;
  }
  if (fromBase64url(keys.p256dh).length !== 65 || fromBase64url(keys.auth).length !== 16) return undefined;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
};

export const createApp = ({ db, accounts, leagues, vapid, now = Date.now, ai, adminToken, speech, game = DEFAULT_GAME }: AppDeps) => {
  const app = new Hono<Env>();
  app.use("/v1/*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "PUT"], maxAge: 600 }));
  app.route("/", publicRoutes);

  // The review queue, for reviewers only. No CORS: reviewers use tools, not the learner app.
  if (adminToken !== undefined && adminToken !== "") {
    app.use("/admin/v1/*", async (c, next) => {
      const token = bearer(c.req.header("authorization"));
      return token !== undefined && sameSecret(token, adminToken) ? next() : c.json({ error: "unauthorized" }, 401);
    });
    const filter = (c: Context): { status?: ReportStatus; course?: string } | undefined => {
      const status = c.req.query("status");
      const course = c.req.query("course");
      if (status !== undefined && !STATUSES.includes(status as ReportStatus)) return undefined;
      return { ...(status === undefined ? {} : { status: status as ReportStatus }), ...(course === undefined ? {} : { course }) };
    };
    app.get("/admin/v1/reports", async (c) => {
      const f = filter(c);
      return f === undefined ? c.json({ error: "invalid-status" }, 400) : c.json({ reports: await listReports(db, f) });
    });
    app.get("/admin/v1/reports.jsonl", async (c) => {
      const f = filter(c);
      if (f === undefined) return c.json({ error: "invalid-status" }, 400);
      c.header("Content-Type", "application/x-ndjson; charset=utf-8");
      return c.body((await listReports(db, f)).map((r) => `${JSON.stringify(r)}\n`).join(""));
    });
    app.post("/admin/v1/reports/:id", async (c) => {
      const b = await body(c);
      const status = b?.["status"];
      if (typeof status !== "string" || !STATUSES.includes(status as ReportStatus) || status === "pending") return c.json({ error: "invalid-status" }, 400);
      return (await setStatus(db, c.req.param("id"), status as ReportStatus, now())) ? c.body(null, 204) : c.json({ error: "not-found" }, 404);
    });
  }

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
    // Only the server issues revisions (§8.3): a device may hand back one it was given, never a new one.
    const revisions = checked.events.filter((e) => e.type === "outcome_revised").map((e) => e.id);
    const issued = await existing(db, user, revisions);
    const batch = checked.events.filter((e) => e.type !== "outcome_revised" || issued.has(e.id));
    const result = await append(db, user, batch, new Date(now()));
    if (leagues !== undefined && result.accepted > 0) await joinIfActive(db, user, now(), leagues);
    if (ai !== undefined) {
      // Reports join the review queue; filing one twice changes nothing (one vote per learner).
      const subject = await ai.gateway.subjectOf(user);
      for (const e of batch) {
        if (e.type !== "answer_reported") continue;
        await fileReport(db, ai.courses, { course: e.course, orthography: e.orthography, template: e.exercise.template, item: e.exercise.item, answer: e.text, note: e.note, subject, source: "report" }, now());
      }
    }
    return c.json({ ...result, refused: checked.events.length - batch.length });
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

  // The game state of the whole log (Phase 10: devices check it matches theirs). A device passes
  // its own clock, as the projection depends on the date; the server's otherwise.
  app.get("/v1/game", async (c) => {
    const at = c.req.query("now") ?? new Date(now()).toISOString();
    const today = c.req.query("today");
    if (Number.isNaN(Date.parse(at)) || (today !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(today))) return c.json({ error: "invalid-clock" }, 400);
    return c.json({ game: await gameStateOf(db, c.get("user").id, game, { now: new Date(at).toISOString(), today }) });
  });

  app.get("/v1/profile", async (c) => c.json({ profile: await getProfile(db, c.get("user").id) }));

  app.put("/v1/profile", async (c) => {
    const b = await body(c);
    if (b === undefined || typeof b["username"] !== "string") return c.json({ error: { code: "invalid-request" } }, 400);
    const result = await setProfile(db, c.get("user").id, {
      username: b["username"],
      displayName: typeof b["displayName"] === "string" ? b["displayName"] : null,
      ...(typeof b["uiLocale"] === "string" ? { uiLocale: b["uiLocale"] } : {}),
    });
    if (result.ok) return c.json({ profile: result.profile });
    const taken = result.error.code === "username-taken" || result.error.code === "username-confusable";
    return c.json({ error: result.error }, taken ? 409 : 400);
  });

  app.get("/v1/league", async (c) => c.json(leagues === undefined ? { enabled: false } : await leagueView(db, c.get("user").id, now(), leagues)));

  app.get("/v1/push/key", async (c) => (vapid === undefined ? c.json({ error: "push-disabled" }, 404) : c.json({ publicKey: base64url((await vapid()).publicKey) })));

  app.post("/v1/push/subscribe", async (c) => {
    if (vapid === undefined) return c.json({ error: "push-disabled" }, 404);
    const b = await body(c);
    const sub = b === undefined ? undefined : validSubscription(b);
    if (sub === undefined) return c.json({ error: "invalid-subscription" }, 400);
    const user = c.get("user").id;
    await db
      .insert(pushSubscriptions)
      .values({ ...sub, userId: user })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user, p256dh: sub.p256dh, auth: sub.auth } });
    return c.body(null, 201);
  });

  app.post("/v1/push/unsubscribe", async (c) => {
    const b = await body(c);
    const endpoint = b?.["endpoint"];
    if (typeof endpoint !== "string") return c.json({ error: "invalid-request" }, 400);
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, c.get("user").id)));
    return c.body(null, 204);
  });

  if (ai !== undefined) aiRoutes(app, { db, ...ai, now });
  if (ai !== undefined && speech !== undefined) speechRoutes(app, { db, courses: ai.courses, gateway: ai.gateway, now, ...speech });

  return app;
};

export type App = ReturnType<typeof createApp>;
