/**
 * Optional accounts (gameplan §14.2): email and password, opaque bearer
 * tokens. This is the adapter §4 puts in front of an auth library; the v0
 * implementation is self-contained (scrypt from node:crypto, tokens stored
 * as SHA-256), so a library such as Better Auth can replace it behind the
 * same interface (ADR 0038).
 *
 * Errors are codes, never prose: the client turns them into its own UI
 * messages.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type BinaryLike, type ScryptOptions } from "node:crypto";
import { graphemeCount } from "@nabu/core/text";
import { and, eq, gt } from "drizzle-orm";
import { uuidv7 } from "./ids.ts";
import type { Db } from "./db/index.ts";
import { authSessions, users } from "./db/schema.ts";

export type AccountError = "invalid-email" | "weak-password" | "email-taken" | "wrong-credentials";
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export interface Account {
  readonly id: string;
  readonly email: string;
}

export interface SignedIn {
  readonly user: Account;
  readonly token: string;
}

export interface Accounts {
  readonly signUp: (email: string, password: string) => Promise<Result<SignedIn, AccountError>>;
  readonly signIn: (email: string, password: string) => Promise<Result<SignedIn, AccountError>>;
  readonly signOut: (token: string) => Promise<void>;
  readonly userOf: (token: string) => Promise<Account | undefined>;
}

/** Shortest password, in user-perceived characters (grapheme clusters). */
export const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 1024;
const SESSION_DAYS = 180;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

const scrypt = (password: BinaryLike, salt: BinaryLike, keylen: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => scryptCb(password, salt, keylen, options, (err, key) => (err === null ? resolve(key) : reject(err))));

/**
 * The address as an account key: NFC, trimmed; the domain converted to its
 * IDNA ASCII form, which is case-insensitive and lower-cased by the URL
 * parser. The local part keeps its case (RFC 5321 leaves it to the host).
 */
export const normalizeEmail = (email: string): string | undefined => {
  const value = email.normalize("NFC").trim();
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1 || /\s/u.test(value)) return undefined;
  const local = value.slice(0, at);
  try {
    const host = new URL(`http://${value.slice(at + 1)}`).hostname;
    return host.includes(".") ? `${local}@${host}` : undefined;
  } catch {
    return undefined;
  }
};

const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFC"), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
};

const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || salt === undefined || key === undefined) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await scrypt(password.normalize("NFC"), Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
};

const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

/** A password the user can actually type again, of reasonable length. */
const passwordOk = (password: string): boolean =>
  graphemeCount(password.normalize("NFC")) >= MIN_PASSWORD && Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES;

export const createAccounts = (db: Db, now: () => Date = () => new Date()): Accounts => {
  const startSession = async (user: Account): Promise<SignedIn> => {
    const token = randomBytes(32).toString("base64url");
    await db.insert(authSessions).values({ tokenHash: tokenHash(token), userId: user.id, expiresAt: new Date(now().getTime() + SESSION_DAYS * 86_400_000) });
    return { user, token };
  };

  return {
    signUp: async (email, password) => {
      const key = normalizeEmail(email);
      if (key === undefined) return { ok: false, error: "invalid-email" };
      if (!passwordOk(password)) return { ok: false, error: "weak-password" };
      const id = uuidv7(now().getTime());
      const inserted = await db.insert(users).values({ id, email: key, passwordHash: await hashPassword(password) }).onConflictDoNothing().returning({ id: users.id });
      if (inserted.length === 0) return { ok: false, error: "email-taken" };
      return { ok: true, value: await startSession({ id, email: key }) };
    },
    signIn: async (email, password) => {
      const key = normalizeEmail(email);
      const [row] = key === undefined ? [] : await db.select().from(users).where(eq(users.email, key));
      // Hash anyway when the address is unknown, so timing does not reveal which accounts exist.
      const ok = await verifyPassword(password, row?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
      if (row === undefined || !ok) return { ok: false, error: "wrong-credentials" };
      return { ok: true, value: await startSession({ id: row.id, email: row.email }) };
    },
    signOut: async (token) => {
      await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash(token)));
    },
    userOf: async (token) => {
      const [row] = await db
        .select({ id: users.id, email: users.email })
        .from(authSessions)
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(and(eq(authSessions.tokenHash, tokenHash(token)), gt(authSessions.expiresAt, now())));
      return row;
    },
  };
};
