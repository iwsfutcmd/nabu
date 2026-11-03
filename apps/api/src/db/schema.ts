/**
 * Postgres tables (gameplan §14.3) as Drizzle definitions. The event log is
 * append-only and keyed by the client's UUIDv7, the idempotency key; `seq` is
 * the server's receipt order, used as the sync cursor. Projections are not
 * stored: the server replays the log with the same @nabu/core as the device.
 */
import { bigserial, date, index, jsonb, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
