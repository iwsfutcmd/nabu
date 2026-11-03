/**
 * Practice reminders on Android and iOS (gameplan §12.6, §16 Phase 10; ADR 0048). The Capacitor
 * app registers its device token; reminders then go through Firebase Cloud Messaging (Android,
 * HTTP v1 with a service account) or APNs (iOS, token-based authentication over HTTP/2). The
 * notification is the same localized title and body as Web Push.
 *
 * Credentials come from the environment only (paths to the files, never their contents in
 * configuration or chat):
 *   NABU_FCM_SERVICE_ACCOUNT   Firebase service-account JSON
 *   NABU_APNS_KEY              APNs auth key (.p8), with NABU_APNS_KEY_ID, NABU_APNS_TEAM_ID,
 *                              NABU_APNS_TOPIC (the app's bundle id); NABU_APNS_SANDBOX=1 for
 *                              development builds
 */
import { connect } from "node:http2";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Notification } from "./reminders.ts";

export type Platform = "android" | "ios";
export const PLATFORMS: readonly Platform[] = ["android", "ios"];

/** What a push service said: delivered, the token is dead (forget it), or something else failed. */
export type Delivery = "sent" | "gone" | "failed";
export type NativeSend = (token: string, notification: Notification) => Promise<Delivery>;
export type NativeSenders = Partial<Record<Platform, NativeSend>>;

/** One HTTP request and its answer: a seam for tests, and HTTP/2 for APNs. */
export interface HttpRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}
export interface HttpResponse {
  readonly status: number;
  readonly body: string;
}
export type Http = (request: HttpRequest) => Promise<HttpResponse>;

/** Device tokens as the push services issue them. */
export const validToken = (platform: Platform, token: string): boolean =>
  platform === "ios" ? /^[0-9a-f]{64,200}$/iu.test(token) : /^[A-Za-z0-9_:-]{20,4096}$/u.test(token);

const b64url = (data: string | Buffer): string => Buffer.from(data).toString("base64url");

/** A JWT signed with RS256 (Google) or ES256 (Apple, raw r‖s). */
const jwt = (header: object, claims: object, key: KeyObject, alg: "RS256" | "ES256"): string => {
  const signing = `${b64url(JSON.stringify({ ...header, alg }))}.${b64url(JSON.stringify(claims))}`;
  const signature = sign("sha256", Buffer.from(signing), alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key);
  return `${signing}.${b64url(signature)}`;
};

export interface ServiceAccount {
  readonly project_id: string;
  readonly client_email: string;
  readonly private_key: string;
  readonly token_uri?: string;
}

export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** FCM HTTP v1: an OAuth access token from a signed assertion (kept until it nearly expires), then one message per token. */
export const fcmSender = (account: ServiceAccount, http: Http, now: () => number = Date.now): NativeSend => {
  const key = createPrivateKey(account.private_key);
  const audience = account.token_uri ?? "https://oauth2.googleapis.com/token";
  let cached: { readonly token: string; readonly until: number } | undefined;
  const accessToken = async (): Promise<string> => {
    const t = Math.floor(now() / 1000);
    if (cached !== undefined && cached.until > t + 60) return cached.token;
    const assertion = jwt({ typ: "JWT" }, { iss: account.client_email, scope: FCM_SCOPE, aud: audience, iat: t, exp: t + 3600 }, key, "RS256");
    const res = await http({
      url: audience,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    });
    if (res.status !== 200) throw new Error(`fcm: access token refused (${res.status})`);
    const granted = JSON.parse(res.body) as { access_token: string; expires_in: number };
    cached = { token: granted.access_token, until: t + granted.expires_in };
    return cached.token;
  };
  return async (token, n) => {
    const res = await http({
      url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token, notification: { title: n.title, body: n.body }, android: { notification: { tag: n.tag } }, data: { url: n.url, lang: n.lang, dir: n.dir } } }),
    });
    if (res.status === 200) return "sent";
    return res.status === 404 || res.body.includes("UNREGISTERED") ? "gone" : "failed";
  };
};

export interface ApnsConfig {
  /** The .p8 auth key (PEM). */
  readonly key: string;
  readonly keyId: string;
  readonly teamId: string;
  /** The app's bundle id. */
  readonly topic: string;
  readonly sandbox: boolean;
}

/** APNs with token-based authentication: an ES256 provider token, renewed every 50 minutes (Apple allows 20–60). */
export const apnsSender = (config: ApnsConfig, http: Http, now: () => number = Date.now): NativeSend => {
  const key = createPrivateKey(config.key);
  let provider: { readonly value: string; readonly at: number } | undefined;
  const bearer = (): string => {
    const t = Math.floor(now() / 1000);
    if (provider === undefined || t - provider.at > 50 * 60) provider = { value: jwt({ kid: config.keyId }, { iss: config.teamId, iat: t }, key, "ES256"), at: t };
    return provider.value;
  };
  const host = config.sandbox ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  return async (token, n) => {
    const res = await http({
      url: `${host}/3/device/${token}`,
      headers: { authorization: `bearer ${bearer()}`, "apns-topic": config.topic, "apns-push-type": "alert", "apns-priority": "10", "apns-collapse-id": n.tag, "content-type": "application/json" },
      body: JSON.stringify({ aps: { alert: { title: n.title, body: n.body }, "thread-id": n.tag }, url: n.url, lang: n.lang, dir: n.dir }),
    });
    if (res.status === 200) return "sent";
    return res.status === 410 || res.body.includes("BadDeviceToken") || res.body.includes("Unregistered") ? "gone" : "failed";
  };
};

/** POST over HTTP/1.1 (FCM). */
export const fetchHttp: Http = async (request) => {
  const res = await fetch(request.url, { method: "POST", headers: request.headers, body: request.body });
  return { status: res.status, body: await res.text() };
};

/** POST over HTTP/2, which APNs requires. */
export const http2: Http = (request) =>
  new Promise((resolve, reject) => {
    const url = new URL(request.url);
    const client = connect(url.origin);
    client.on("error", reject);
    const stream = client.request({ ":method": "POST", ":path": `${url.pathname}${url.search}`, ...request.headers });
    let status = 0;
    let body = "";
    stream.setEncoding("utf8");
    stream.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    stream.on("data", (chunk: string) => {
      body += chunk;
    });
    stream.on("end", () => {
      client.close();
      resolve({ status, body });
    });
    stream.on("error", (e: Error) => {
      client.close();
      reject(e);
    });
    stream.end(request.body);
  });

/** The senders this instance has credentials for (none: native reminders are off). */
export const nativeSendersFromEnv = (env: Readonly<Record<string, string | undefined>>): NativeSenders => {
  const out: { android?: NativeSend; ios?: NativeSend } = {};
  const fcm = env["NABU_FCM_SERVICE_ACCOUNT"];
  if (fcm !== undefined && fcm !== "") out.android = fcmSender(JSON.parse(readFileSync(fcm, "utf8")) as ServiceAccount, fetchHttp);
  const apns = env["NABU_APNS_KEY"];
  if (apns !== undefined && apns !== "") {
    const need = (name: string): string => {
      const value = env[name];
      if (value === undefined || value === "") throw new Error(`NABU_APNS_KEY needs ${name}`);
      return value;
    };
    out.ios = apnsSender({ key: readFileSync(apns, "utf8"), keyId: need("NABU_APNS_KEY_ID"), teamId: need("NABU_APNS_TEAM_ID"), topic: need("NABU_APNS_TOPIC"), sandbox: env["NABU_APNS_SANDBOX"] === "1" }, http2);
  }
  return out;
};
