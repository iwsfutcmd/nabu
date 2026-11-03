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
  [
    "0002_profiles_leagues_push",
    [
      `create table profiles (
        user_id uuid primary key references users(id) on delete cascade,
        username text not null,
        username_key text not null unique,
        username_skeleton text not null unique,
        display_name text,
        ui_locale text not null default 'en',
        updated_at timestamptz not null default now()
      )`,
      `create table league_members (
        week date not null,
        user_id uuid not null references users(id) on delete cascade,
        tier smallint not null,
        cohort integer not null,
        joined_at timestamptz not null default now(),
        primary key (week, user_id)
      )`,
      `create index league_members_cohort on league_members (week, tier, cohort)`,
      `create table league_results (
        week date not null,
        user_id uuid not null references users(id) on delete cascade,
        tier smallint not null,
        cohort integer not null,
        xp integer not null,
        rank integer not null,
        outcome text not null,
        next_tier smallint not null,
        primary key (week, user_id)
      )`,
      `create table league_weeks (
        week date primary key,
        rolled_at timestamptz not null default now()
      )`,
      `create table push_subscriptions (
        endpoint text primary key,
        user_id uuid not null references users(id) on delete cascade,
        p256dh text not null,
        auth text not null,
        created_at timestamptz not null default now()
      )`,
      `create table push_log (
        user_id uuid not null references users(id) on delete cascade,
        local_date date not null,
        template text not null,
        sent_at timestamptz not null default now(),
        primary key (user_id, local_date)
      )`,
      `create table server_keys (
        name text primary key,
        value text not null
      )`,
    ],
  ],
];
