/**
 * The relay acts as one Google account (ADR 0075): the owner signs in once, in a browser, and keeps
 * the refresh token as the Worker secret GOOGLE_REFRESH_TOKEN. Sign-in is open only while that
 * secret is unset, and the state is bound to a cookie, so nobody can make the relay act for another
 * account. A service account cannot do this job: it may read a shared folder, but files it creates
 * in a personal Drive fail for want of storage of its own.
 */
import { accountEmail, makeDrive, type Fetch, type Tokens } from "./drive.ts";
import { fail, json, ok, type Outcome } from "./outcome.ts";

export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** All of Drive: drive.file would not see what the owner adds in Drive itself. The relay confines itself. */
export const SCOPE = "https://www.googleapis.com/auth/drive";
const STATE_TTL_MS = 10 * 60 * 1000;
const COOKIE = "__Host-nabu-oauth";

export type Secrets = {
  readonly relayKey: string;
  readonly clientId: string;
  readonly clientSecret: string;
};

/** The access token this isolate holds, shared by its requests. */
export type TokenCell = { token: string | null; expires: number };

export type Clock = () => number;

const encoder = new TextEncoder();

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

const hmac = async (key: string, message: string): Promise<string> => {
  const imported = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", imported, encoder.encode(message))));
};

/** Compares two secrets in time that does not depend on where they differ. */
export const sameSecret = async (a: string, b: string): Promise<boolean> => {
  const [x, y] = await Promise.all(
    [a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)))),
  );
  if (x === undefined || y === undefined) return false;
  let diff = 0;
  x.forEach((byte, i) => {
    diff |= byte ^ (y[i] ?? 0);
  });
  return diff === 0;
};

const form = (fields: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

const DETAIL_LIMIT = 300;

/** Access tokens from the refresh token, cached in the isolate until a minute before they lapse. */
export const refreshingTokens = (
  fetchFn: Fetch,
  secrets: Secrets,
  refreshToken: string,
  cell: TokenCell,
  now: Clock,
): Tokens => ({
  get: async () => {
    if (cell.token !== null && now() < cell.expires) return ok(cell.token);
    const response = await fetchFn(
      TOKEN_URL,
      form({
        client_id: secrets.clientId,
        client_secret: secrets.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, DETAIL_LIMIT);
      // invalid_grant: revoked, or unused for six months. The owner signs in again (README).
      return fail(503, detail.includes("invalid_grant") ? "sign-in-expired" : "token-refresh-failed", detail);
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    cell.token = body.access_token;
    cell.expires = now() + Math.max(0, body.expires_in - 60) * 1000;
    return ok(body.access_token);
  },
  invalidate: () => {
    cell.token = null;
  },
});

const redirectUri = (url: URL): string => `${url.origin}/oauth/callback`;

const cookieOf = (request: Request): string | null => {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE) return value.join("=");
  }
  return null;
};

/** GET /oauth/start: to Google's consent screen, with a state bound to a fresh cookie. */
export const startSignIn = async (
  url: URL,
  secrets: Secrets,
  now: Clock,
  random: (size: number) => Uint8Array,
): Promise<Response> => {
  const nonce = base64url(random(16));
  const issued = String(now());
  const state = `${issued}.${await hmac(secrets.relayKey, `${issued}.${nonce}`)}`;
  const params = new URLSearchParams({
    client_id: secrets.clientId,
    redirect_uri: redirectUri(url),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return new Response(null, {
    status: 302,
    headers: {
      location: `${AUTH_URL}?${params.toString()}`,
      "set-cookie": `${COOKIE}=${nonce}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${STATE_TTL_MS / 1000}`,
      "cache-control": "no-store",
    },
  });
};

const checkState = async (
  request: Request,
  state: string | null,
  secrets: Secrets,
  now: Clock,
): Promise<Outcome<null>> => {
  const nonce = cookieOf(request);
  const [issued, mac, ...rest] = (state ?? "").split(".");
  if (nonce === null || issued === undefined || mac === undefined || rest.length > 0) return fail(400, "bad-state");
  const age = now() - Number(issued);
  if (!(age >= 0 && age <= STATE_TTL_MS)) return fail(400, "state-expired");
  return (await sameSecret(mac, await hmac(secrets.relayKey, `${issued}.${nonce}`))) ? ok(null) : fail(400, "bad-state");
};

/**
 * GET /oauth/callback: exchanges the code and shows the refresh token once, with the account it is
 * for. The owner checks the account and stores the token with `wrangler secret put`.
 */
export const finishSignIn = async (
  request: Request,
  url: URL,
  secrets: Secrets,
  fetchFn: Fetch,
  now: Clock,
): Promise<Outcome<Response>> => {
  const denied = url.searchParams.get("error");
  if (denied !== null) return fail(400, "google-refused", denied);
  const state = await checkState(request, url.searchParams.get("state"), secrets, now);
  if (!state.ok) return state;
  const code = url.searchParams.get("code");
  if (code === null) return fail(400, "no-code");
  const response = await fetchFn(
    TOKEN_URL,
    form({
      code,
      client_id: secrets.clientId,
      client_secret: secrets.clientSecret,
      redirect_uri: redirectUri(url),
      grant_type: "authorization_code",
    }),
  );
  if (!response.ok) return fail(502, "code-exchange-failed", (await response.text()).slice(0, DETAIL_LIMIT));
  const tokens = (await response.json()) as { access_token: string; refresh_token?: string };
  if (tokens.refresh_token === undefined) return fail(502, "no-refresh-token");
  const once: Tokens = { get: () => Promise.resolve(ok(tokens.access_token)), invalidate: () => undefined };
  const email = await accountEmail(makeDrive(fetchFn, once));
  if (!email.ok) return email;
  return ok(
    json(
      200,
      {
        account: email.value,
        GOOGLE_REFRESH_TOKEN: tokens.refresh_token,
        next: "If the account is yours: npx wrangler@4 secret put GOOGLE_REFRESH_TOKEN",
      },
      { "set-cookie": `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0` },
    ),
  );
};
