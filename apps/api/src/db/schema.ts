/**
 * Postgres tables (gameplan §14.3) as Drizzle definitions. The event log is
 * append-only and keyed by the client's UUIDv7, the idempotency key; `seq` is
 * the server's receipt order, used as the sync cursor. Projections are not
 * stored: the server replays the log with the same @nabu/core as the device.
 */
import { bigserial, date, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Applied migrations (migrations.ts), by name. */
export const schemaMigrations = pgTable("schema_migrations", {
  name: text("name").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  /** NFC, with the domain in IDNA ASCII lower case: the key that must be unique. */
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable("auth_sessions", {
  /** SHA-256 of the bearer token: a leaked table does not leak sessions. */
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const events = pgTable(
  "events",
  {
    seq: bigserial("seq", { mode: "number" }).notNull().unique(),
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    type: text("type").notNull(),
    schema: smallint("schema").notNull(),
    course: text("course").notNull(),
    bundle: text("bundle").notNull(),
    clientTime: timestamp("client_time", { withTimezone: true }).notNull(),
    localDate: date("local_date").notNull(),
    tz: text("tz").notNull(),
    serverTime: timestamp("server_time", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [index("events_user_seq").on(t.userId, t.seq), index("events_user_course_seq").on(t.userId, t.course, t.seq)],
);

/** A user's public face (gameplan §12.7): a UTS #39 username, a free-form display name, a UI locale for notifications. */
export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  /** NFKC_Casefold: one name in many guises. */
  usernameKey: text("username_key").notNull().unique(),
  /** UTS #39 skeleton: names that look alike collide. */
  usernameSkeleton: text("username_skeleton").notNull().unique(),
  displayName: text("display_name"),
  uiLocale: text("ui_locale").notNull().default("en"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Who is in which cohort in a league week (week = its first date, UTC). */
export const leagueMembers = pgTable(
  "league_members",
  {
    week: date("week").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: smallint("tier").notNull(),
    cohort: integer("cohort").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.week, t.userId] }), index("league_members_cohort").on(t.week, t.tier, t.cohort)],
);

/** A rolled-over week's final standings: written once per (week, user). */
export const leagueResults = pgTable(
  "league_results",
  {
    week: date("week").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: smallint("tier").notNull(),
    cohort: integer("cohort").notNull(),
    xp: integer("xp").notNull(),
    rank: integer("rank").notNull(),
    outcome: text("outcome").notNull(),
    nextTier: smallint("next_tier").notNull(),
  },
  (t) => [primaryKey({ columns: [t.week, t.userId] })],
);

/** Weeks already rolled over: the rollover's idempotency key. */
export const leagueWeeks = pgTable("league_weeks", {
  week: date("week").primaryKey(),
  rolledAt: timestamp("rolled_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Reminders sent, at most one per user and local date. */
export const pushLog = pgTable(
  "push_log",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    localDate: date("local_date").notNull(),
    template: text("template").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate] })],
);

/** Server-held secrets that must survive restarts (the VAPID key pair). */
export const serverKeys = pgTable("server_keys", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
});
