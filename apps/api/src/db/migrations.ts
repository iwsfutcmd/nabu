/**
 * Schema migrations, applied in order and recorded in `schema_migrations`.
 * Statements are plain SQL so they run the same on Postgres and PGlite. Keep
 * them in step with schema.ts; never edit an applied migration, add one.
 */
export const MIGRATIONS: readonly (readonly [string, readonly string[]])[] = [
  [
    "0001_events_and_accounts",
    [
      `create table users (
        id uuid primary key,
        email text not null unique,
        password_hash text not null,
        created_at timestamptz not null default now()
      )`,
      `create table auth_sessions (
        token_hash text primary key,
        user_id uuid not null references users(id) on delete cascade,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null
      )`,
      `create table events (
        seq bigserial not null unique,
        id uuid primary key,
        user_id uuid not null references users(id) on delete cascade,
        device_id text not null,
        type text not null,
        schema smallint not null,
        course text not null,
        bundle text not null,
        client_time timestamptz not null,
        local_date date not null,
        tz text not null,
        server_time timestamptz not null default now(),
        payload jsonb not null
      )`,
      `create index events_user_seq on events (user_id, seq)`,
      `create index events_user_course_seq on events (user_id, course, seq)`,
    ],
  ],
];
