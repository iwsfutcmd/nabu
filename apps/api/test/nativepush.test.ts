/**
 * Native reminders (Phase 10): what the server sends to Firebase Cloud Messaging and to APNs.
 * The push services are stood in for by a recorder (no request leaves the machine); the tests
 * check the requests against the services' published formats, and verify every signature with
 * a key generated here. Delivery to real devices needs real credentials and is not tested.
 */
import { generateKeyPairSync, randomUUID, verify, type KeyObject } from "node:crypto";
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccounts } from "../src/accounts.ts";
import { createApp, type App } from "../src/app.ts";
import type { Database } from "../src/db/index.ts";
import { testDatabase } from "./database.ts";
import { nativePushTokens } from "../src/db/schema.ts";
import { apnsSender, FCM_SCOPE, fcmSender, validToken, type Delivery, type Http, type HttpRequest, type HttpResponse, type NativeSend } from "../src/nativepush.ts";
import { sendReminders, type Notification } from "../src/reminders.ts";

const reminder: Notification = { title: "یادت نره!", body: "پنج دقیقه فارسی؟", lang: "fa", dir: "rtl", tag: "nabu-reminder", url: "./" };

const recorder = (answer: (r: HttpRequest) => HttpResponse): { http: Http; sent: HttpRequest[] } => {
  const sent: HttpRequest[] = [];
  return { sent, http: (r) => (sent.push(r), Promise.resolve(answer(r))) };
};

/** Decodes a JWT and checks its signature with `key`. */
const checkJwt = (token: string, key: KeyObject, alg: "RS256" | "ES256"): { header: Record<string, unknown>; claims: Record<string, unknown> } => {
  const [h = "", c = "", s = ""] = token.split(".");
  const ok = verify("sha256", Buffer.from(`${h}.${c}`), alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key, Buffer.from(s, "base64url"));
  expect(ok).toBe(true);
  const header = JSON.parse(Buffer.from(h, "base64url").toString()) as Record<string, unknown>;
  expect(header["alg"]).toBe(alg);
  return { header, claims: JSON.parse(Buffer.from(c, "base64url").toString()) as Record<string, unknown> };
};

describe("Firebase Cloud Messaging (Android)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const account = { project_id: "nabu-test", client_email: "push@nabu-test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };

  it("signs a service-account assertion, keeps the access token, and sends the localized reminder", async () => {
    let clock = Date.parse("2026-11-03T08:00:00Z");
    const { http, sent } = recorder((r) =>
      r.url.endsWith("/token") ? { status: 200, body: JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }) } : r.body.includes("dead-token") ? { status: 404, body: '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}' } : { status: 200, body: "{}" },
    );
    const send = fcmSender(account, http, () => clock);
    expect(await send("fcm-token-0123456789abcdef", reminder)).toBe("sent");
    clock += 30 * 60_000;
    expect(await send("fcm-token-0123456789abcdef", reminder)).toBe("sent");
    const [grant, first, second] = sent;
    expect(sent.filter((r) => r.url.endsWith("/token"))).toHaveLength(1); // one token for the hour

    const form = new URLSearchParams(grant?.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const { claims } = checkJwt(form.get("assertion") ?? "", publicKey, "RS256");
    expect(claims).toMatchObject({ iss: account.client_email, scope: FCM_SCOPE, aud: "https://oauth2.googleapis.com/token" });
    expect(Number(claims["exp"]) - Number(claims["iat"])).toBe(3600);

    expect(first?.url).toBe("https://fcm.googleapis.com/v1/projects/nabu-test/messages:send");
    expect(first?.headers["Authorization"]).toBe("Bearer ya29.test");
    expect(JSON.parse(first?.body ?? "{}")).toEqual({
      message: { token: "fcm-token-0123456789abcdef", notification: { title: reminder.title, body: reminder.body }, android: { notification: { tag: "nabu-reminder" } }, data: { url: "./", lang: "fa", dir: "rtl" } },
    });
    expect(second?.headers["Authorization"]).toBe("Bearer ya29.test");
    expect(await send("dead-token-0123456789abcdef", reminder)).toBe("gone");
  });
});

describe("APNs (iOS)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const config = { key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), keyId: "ABC123DEFG", teamId: "TEAM123456", topic: "org.nabu.app", sandbox: false };
  const device = "a".repeat(64);

  it("signs a provider token (renewed within the hour) and sends an alert to the device", async () => {
    let clock = Date.parse("2026-11-03T08:00:00Z");
    const { http, sent } = recorder((r) => (r.url.endsWith("b".repeat(64)) ? { status: 410, body: '{"reason":"Unregistered"}' } : { status: 200, body: "" }));
    const send = apnsSender(config, http, () => clock);
    expect(await send(device, reminder)).toBe("sent");
    const [first] = sent;
    expect(first?.url).toBe(`https://api.push.apple.com/3/device/${device}`);
    expect(first?.headers).toMatchObject({ "apns-topic": "org.nabu.app", "apns-push-type": "alert", "apns-priority": "10", "apns-collapse-id": "nabu-reminder" });
    const token = (first?.headers["authorization"] ?? "").replace(/^bearer /u, "");
    const { header, claims } = checkJwt(token, publicKey, "ES256");
    expect(header["kid"]).toBe("ABC123DEFG");
    expect(claims).toEqual({ iss: "TEAM123456", iat: Math.floor(clock / 1000) });
    expect(JSON.parse(first?.body ?? "{}")).toEqual({ aps: { alert: { title: reminder.title, body: reminder.body }, "thread-id": "nabu-reminder" }, url: "./", lang: "fa", dir: "rtl" });

    clock += 40 * 60_000;
    await send(device, reminder);
    expect(sent[1]?.headers["authorization"]).toBe(first?.headers["authorization"]);
    clock += 20 * 60_000;
    await send(device, reminder);
    expect(sent[2]?.headers["authorization"]).not.toBe(first?.headers["authorization"]);
    expect(await send("b".repeat(64), reminder)).toBe("gone");
  });

  it("uses the sandbox for development builds", async () => {
    const { http, sent } = recorder(() => ({ status: 200, body: "" }));
    await apnsSender({ ...config, sandbox: true }, http)(device, reminder);
    expect(sent[0]?.url).toBe(`https://api.sandbox.push.apple.com/3/device/${device}`);
  });
});

describe("device tokens", () => {
  it("accepts the shapes the services issue, and nothing else", () => {
    expect(validToken("ios", "0f".repeat(32))).toBe(true);
    expect(validToken("ios", "not hex")).toBe(false);
    expect(validToken("android", "dXk3:APA91bH-abc_DEF0123456789")).toBe(true);
    expect(validToken("android", "short")).toBe(false);
    expect(validToken("android", "has spaces in it, not a token at all")).toBe(false);
  });
});

// ------------------------------------------------------------------- Device tokens on the server

describe("native reminders on the server", () => {
  let database: Database;
  let app: App;
  const delivered: { platform: string; token: string; notification: Notification }[] = [];
  let answer: Delivery = "sent";
  const sender =
    (platform: string): NativeSend =>
    (token, notification) => {
      delivered.push({ platform, token, notification });
      return Promise.resolve(answer);
    };
  const native = { android: sender("android"), ios: sender("ios") };

  beforeAll(async () => {
    database = await testDatabase();
    app = createApp({ db: database.db, accounts: createAccounts(database.db), native });
  });
  afterAll(async () => database.close());

  const request = (method: string, body: unknown, token?: string): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json", ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const at = (iso: string): number => Date.parse(iso);

  /** A finished lesson at `iso`, as a device logs it. */
  const session = (iso: string): LearnerEvent[] => {
    const s = randomUUID();
    const base = (offset: number) => {
      const t = new Date(at(iso) + offset * 1000).toISOString();
      return { id: randomUUID(), schema: 1 as const, device: "phone", course: "fa", orthography: "fa-Arab/standard" as OrthographyId, support: "en", bundle: "0".repeat(64), session: s, clientTime: t, localDate: t.slice(0, 10), tz: "UTC" };
    };
    return [
      { ...base(0), type: "session_started", mode: "lesson", node: "fa.greetings", seed: 1, exercises: 1, planner: "t" },
      { ...base(5), type: "session_completed", mode: "lesson", node: "fa.greetings", summary: { completed: true, exercises: 1, correctFirstTry: 1, retries: 0, skipped: 0 } },
    ] as unknown as LearnerEvent[];
  };

  it("registers device tokens, then reminds each device once a day in the learner's locale", async () => {
    expect((await app.request("/v1/push/native", request("GET", undefined, "none"))).status).toBe(401);
    const token = ((await (await app.request("/v1/auth/sign-up", request("POST", { email: "phone@example.org", password: "correct horse battery" }))).json()) as { token: string }).token;
    expect(await (await app.request("/v1/push/native", request("GET", undefined, token))).json()).toEqual({ platforms: ["android", "ios"] });
    await app.request("/v1/profile", request("PUT", { username: "mobile", uiLocale: "ar-XB" }, token));
    expect((await app.request("/v1/events", request("POST", { events: session("2026-07-01T19:00:00Z") }, token))).status).toBe(200);

    const android = "dXk3:APA91bH-0123456789abcdef";
    const ios = "0f".repeat(32);
    expect((await app.request("/v1/push/native/register", request("POST", { platform: "android", token: android }, token))).status).toBe(201);
    expect((await app.request("/v1/push/native/register", request("POST", { platform: "ios", token: ios }, token))).status).toBe(201);
    expect((await app.request("/v1/push/native/register", request("POST", { platform: "ios", token: "nope" }, token))).status).toBe(400);
    expect((await app.request("/v1/push/native/register", request("POST", { platform: "windows", token: ios }, token))).status).toBe(400);

    const evening = at("2026-07-02T19:30:00Z");
    expect((await sendReminders(database.db, evening, undefined, native)).sent).toBe(1);
    expect(delivered.map((d) => [d.platform, d.token])).toEqual([
      ["android", android],
      ["ios", ios],
    ]);
    expect(delivered[0]?.notification).toMatchObject({ lang: "ar-XB", dir: "rtl", tag: "nabu-reminder" });
    await sendReminders(database.db, evening + 60_000, undefined, native);
    expect(delivered).toHaveLength(2); // once a day

    // A token the push service says is dead is forgotten; unregistering removes one.
    answer = "gone";
    await sendReminders(database.db, at("2026-07-03T19:30:00Z"), undefined, native);
    expect(await database.db.select().from(nativePushTokens)).toEqual([]);
    expect((await app.request("/v1/push/native/register", request("POST", { platform: "android", token: android }, token))).status).toBe(201);
    expect((await app.request("/v1/push/native/unregister", request("POST", { token: android }, token))).status).toBe(204);
    expect(await database.db.select().from(nativePushTokens)).toEqual([]);
  });

  it("refuses tokens for a platform this instance cannot reach", async () => {
    const only = createApp({ db: database.db, accounts: createAccounts(database.db), native: { android: sender("android") } });
    const token = ((await (await only.request("/v1/auth/sign-up", request("POST", { email: "ipad@example.org", password: "correct horse battery" }))).json()) as { token: string }).token;
    expect(await (await only.request("/v1/push/native", request("GET", undefined, token))).json()).toEqual({ platforms: ["android"] });
    expect((await only.request("/v1/push/native/register", request("POST", { platform: "ios", token: "0f".repeat(32) }, token))).status).toBe(404);
  });
});
