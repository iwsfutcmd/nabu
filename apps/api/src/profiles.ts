/**
 * Profiles (gameplan §12.7): a username under UTS #39, a free-form display name, and the UI
 * locale notifications are written in.
 *
 * Usernames are unique on NFKC_Casefold, and also on their confusable skeleton, so a name that
 * merely looks like a taken one is refused too. Display names are never unique and are always
 * rendered inside <bdi> by clients.
 */
import { readFileSync } from "node:fs";
import { checkDisplayName, checkUsername, type SecurityData, type UsernameError } from "@nabu/core/text";
import { PSEUDO_LOCALES, UI_LOCALES } from "@nabu/i18n";
import { eq } from "drizzle-orm";
import type { Db } from "./db/index.ts";
import { profiles } from "./db/schema.ts";

const generated = (file: string): unknown => JSON.parse(readFileSync(new URL(`../../../packages/i18n/src/generated/${file}`, import.meta.url), "utf8"));

let data: SecurityData | undefined;
/** The UTS #39 data, loaded once. */
export const securityData = (): SecurityData =>
  (data ??= {
    confusables: (generated("confusables.json") as { map: Record<string, string> }).map,
    allowed: (generated("identifier-allowed.json") as { ranges: [number, number][] }).ranges,
    scripts: Object.keys(generated("script-metadata.json") as Record<string, unknown>),
  });

export interface Profile {
  readonly username: string;
  readonly displayName: string | null;
  readonly uiLocale: string;
}

export type ProfileError =
  | { readonly code: "invalid-username"; readonly reason: UsernameError }
  | { readonly code: "username-taken" }
  | { readonly code: "username-confusable" }
  | { readonly code: "invalid-display-name"; readonly reason: "length" | "characters" }
  | { readonly code: "invalid-locale" };

export type ProfileResult = { readonly ok: true; readonly profile: Profile } | { readonly ok: false; readonly error: ProfileError };

const LOCALES: ReadonlySet<string> = new Set([...UI_LOCALES, ...PSEUDO_LOCALES]);

export const getProfile = async (db: Db, user: string): Promise<Profile | null> => {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, user));
  return row === undefined ? null : { username: row.username, displayName: row.displayName, uiLocale: row.uiLocale };
};

export interface ProfileInput {
  readonly username: string;
  readonly displayName?: string | null | undefined;
  readonly uiLocale?: string | undefined;
}

const isUnique = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
};

/** Creates or replaces the user's profile. */
export const setProfile = async (db: Db, user: string, input: ProfileInput): Promise<ProfileResult> => {
  const checked = checkUsername(input.username, securityData());
  if (!checked.ok) return { ok: false, error: { code: "invalid-username", reason: checked.error } };
  let displayName: string | null = null;
  if (input.displayName !== undefined && input.displayName !== null && input.displayName.trim() !== "") {
    const name = checkDisplayName(input.displayName);
    if (!name.ok) return { ok: false, error: { code: "invalid-display-name", reason: name.error } };
    displayName = name.value;
  }
  const uiLocale = input.uiLocale ?? "en";
  if (!LOCALES.has(uiLocale)) return { ok: false, error: { code: "invalid-locale" } };
  const { display, key, skeleton } = checked.value;
  const [byKey] = await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.usernameKey, key));
  if (byKey !== undefined && byKey.userId !== user) return { ok: false, error: { code: "username-taken" } };
  const [bySkeleton] = await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.usernameSkeleton, skeleton));
  if (bySkeleton !== undefined && bySkeleton.userId !== user) return { ok: false, error: { code: "username-confusable" } };
  const values = { username: display, usernameKey: key, usernameSkeleton: skeleton, displayName, uiLocale, updatedAt: new Date() };
  try {
    await db
      .insert(profiles)
      .values({ userId: user, ...values })
      .onConflictDoUpdate({ target: profiles.userId, set: values });
  } catch (e) {
    // Another sign-up took the name between the check and the write.
    if (isUnique(e)) return { ok: false, error: { code: "username-taken" } };
    throw e;
  }
  return { ok: true, profile: { username: display, displayName, uiLocale } };
};
