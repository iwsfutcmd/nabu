/**
 * Web Push from the server (gameplan §12.6): message encryption (RFC 8291, aes128gcm per
 * RFC 8188) and VAPID (RFC 8292), on node:crypto alone. Tested against RFC 8291's example.
 */
import { createCipheriv, createECDH, createHmac, createPrivateKey, generateKeyPairSync, randomBytes, sign, type JsonWebKey, type KeyObject } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./db/index.ts";
import { serverKeys } from "./db/schema.ts";

export const base64url = (b: Uint8Array): string => Buffer.from(b).toString("base64url");
export const fromBase64url = (s: string): Buffer => Buffer.from(s, "base64url");

const hmac = (key: Uint8Array, data: Uint8Array): Buffer => createHmac("sha256", key).update(data).digest();
const ONE = Buffer.from([1]);

export interface EncryptInput {
  readonly plaintext: Uint8Array;
  /** The subscription's p256dh key: an uncompressed P-256 point (65 bytes). */
  readonly uaPublic: Uint8Array;
  /** The subscription's auth secret (16 bytes). */
  readonly authSecret: Uint8Array;
  /** For tests: the application server's ephemeral private key and salt; random otherwise. */
  readonly asPrivate?: Uint8Array;
  readonly salt?: Uint8Array;
  readonly recordSize?: number;
}

/** RFC 8291 §3–4: one aes128gcm record (header, ciphertext, tag). */
export const encrypt = (input: EncryptInput): Buffer => {
  const ecdh = createECDH("prime256v1");
  if (input.asPrivate === undefined) ecdh.generateKeys();
  else ecdh.setPrivateKey(input.asPrivate);
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(input.uaPublic);
  const prkKey = hmac(input.authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), input.uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, ONE]));
  const salt = input.salt ?? randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), ONE])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0", "latin1"), ONE])).subarray(0, 12);
  const recordSize = input.recordSize ?? 4096;
  if (input.plaintext.length + 1 + 16 > recordSize) throw new Error("push payload too large for one record");
  const header = Buffer.alloc(21 + asPublic.length);
  Buffer.from(salt).copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header.writeUInt8(asPublic.length, 20);
  asPublic.copy(header, 21);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([input.plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([header, body]);
};

export interface Vapid {
  /** Uncompressed P-256 public key: what browsers pass to pushManager.subscribe. */
  readonly publicKey: Buffer;
  readonly privateKey: KeyObject;
  /** RFC 8292 `sub`: a mailto: or https: contact for push services. */
  readonly subject: string;
}

const rawPublic = (jwk: JsonWebKey): Buffer => Buffer.concat([Buffer.from([4]), fromBase64url(jwk.x ?? ""), fromBase64url(jwk.y ?? "")]);

export const vapidFromJwk = (jwk: JsonWebKey, subject: string): Vapid => ({
  publicKey: rawPublic(jwk),
  privateKey: createPrivateKey({ key: jwk, format: "jwk" }),
  subject,
});

/** The server's VAPID keys: NABU_VAPID_PRIVATE_JWK if set, else generated once and kept in the database. */
export const vapidKeys = async (db: Db, subject: string, env: string | undefined = process.env["NABU_VAPID_PRIVATE_JWK"]): Promise<Vapid> => {
  if (env !== undefined && env !== "") return vapidFromJwk(JSON.parse(env) as JsonWebKey, subject);
  const read = async () => (await db.select({ value: serverKeys.value }).from(serverKeys).where(eq(serverKeys.name, "vapid")))[0]?.value;
  let stored = await read();
  if (stored === undefined) {
    const jwk = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" });
    await db.insert(serverKeys).values({ name: "vapid", value: JSON.stringify(jwk) }).onConflictDoNothing();
    stored = await read();
  }
  return vapidFromJwk(JSON.parse(stored ?? "{}") as JsonWebKey, subject);
};

/** RFC 8292 §3: the Authorization header for one push service origin. */
export const vapidAuthorization = (endpoint: string, vapid: Vapid, now: number): string => {
  const header = base64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64url(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: vapid.privateKey, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${base64url(signature)}, k=${base64url(vapid.publicKey)}`;
};

export interface Subscription {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: Uint8Array }) => Promise<{ status: number }>;

/** Encrypts and posts one message; returns the push service's status (201 is delivered, 404/410 gone). */
export const sendPush = async (sub: Subscription, payload: unknown, vapid: Vapid, now: number, fetchImpl: Fetch): Promise<number> => {
  const body = encrypt({ plaintext: Buffer.from(JSON.stringify(payload), "utf8"), uaPublic: fromBase64url(sub.p256dh), authSecret: fromBase64url(sub.auth) });
  const res = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(12 * 3600),
      Urgency: "normal",
      Authorization: vapidAuthorization(sub.endpoint, vapid, now),
    },
    body,
  });
  return res.status;
};
