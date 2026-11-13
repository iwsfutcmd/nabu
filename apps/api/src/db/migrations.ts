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
  [
    "0003_ai",
    [
      // Model outputs by request key (§13.1): the same exercise and normalized answer never costs twice.
      `create table llm_cache (
        key text primary key,
        feature text not null,
        output jsonb not null,
        created_at timestamptz not null default now()
      )`,
      // Calls per subject (a salted hash of the user id, or "instance") per day and feature.
      `create table llm_usage (
        subject text not null,
        day date not null,
        feature text not null,
        calls integer not null default 0,
        primary key (subject, day, feature)
      )`,
      `create table explanation_ratings (
        key text not null,
        subject text not null,
        rating smallint not null,
        rated_at timestamptz not null default now(),
        primary key (key, subject)
      )`,
      // The review queue (§13.2): one row per distinct normalized answer to an item.
      `create table answer_reports (
        id uuid primary key,
        course text not null,
        orthography text not null,
        template text not null,
        item text not null,
        answer text not null,
        normalized text not null,
        status text not null default 'pending',
        notes jsonb not null default '[]',
        judge jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (course, orthography, template, item, normalized)
      )`,
      `create index answer_reports_status on answer_reports (status, course)`,
      // Who stands behind a report (salted hashes, never user ids): the count of independent agreements.
      `create table report_votes (
        report_id uuid not null references answer_reports(id) on delete cascade,
        subject text not null,
        source text not null,
        primary key (report_id, subject)
      )`,
    ],
  ],
  [
    "0004_native_push",
    [
      // Practice reminders to the Android and iOS apps (Phase 10): one row per device token.
      `create table native_push_tokens (
        token text primary key,
        user_id uuid not null references users(id) on delete cascade,
        platform text not null check (platform in ('android', 'ios')),
        created_at timestamptz not null default now()
      )`,
      `create index native_push_tokens_user on native_push_tokens (user_id)`,
    ],
  ],
  [
    "0005_sentence_corrections",
    [
      // Corrections to course content (ADR 0051): one row per distinct correction of an item.
      // A sentence has step -1; a story line, its step in the story.
      `create table sentence_corrections (
        id uuid primary key,
        course text not null,
        orthography text not null,
        support text not null,
        bundle text,
        item text not null,
        step integer not null default -1,
        key text not null,
        shown jsonb not null,
        correction jsonb not null,
        status text not null default 'pending',
        notes jsonb not null default '[]',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (course, item, step, key)
      )`,
      `create index sentence_corrections_status on sentence_corrections (status, course)`,
      // Who suggested it (salted hashes, never user ids); a learner's later suggestion replaces their earlier one.
      `create table correction_votes (
        correction_id uuid not null references sentence_corrections(id) on delete cascade,
        subject text not null,
        primary key (correction_id, subject)
      )`,
    ],
  ],
  [
    "0006_report_claims",
    [
      // "This should have been wrong" (ADR 0052): a report claims accept (the default) or reject,
      // and the same answer can be queued once for each.
      `alter table answer_reports add column claim text not null default 'accept'`,
      `alter table answer_reports drop constraint answer_reports_course_orthography_template_item_normalized_key`,
      `alter table answer_reports add constraint answer_reports_claim_key unique (course, orthography, template, item, normalized, claim)`,
    ],
  ],
  [
    "0007_reviewers",
    [
      // Reviewer accounts (ADR 0074): a handle (provenance names them human:<handle>) and the courses
      // they review (["*"]: all). An instance's admin grants and revokes them.
      `create table reviewers (
        user_id uuid primary key references users(id) on delete cascade,
        handle text not null unique,
        courses jsonb not null,
        granted_at timestamptz not null default now()
      )`,
      // Sign-offs made in the review workspace, until nabu review apply writes them into the source.
      // They keep the handle they were made under, so revoking a reviewer keeps their work.
      `create table signoffs (
        user_id uuid not null references users(id) on delete cascade,
        handle text not null,
        course text not null,
        kind text not null check (kind in ('sentence', 'story')),
        item text not null,
        shown text not null,
        signed_at timestamptz not null,
        primary key (user_id, course, kind, item)
      )`,
      `create index signoffs_course on signoffs (course)`,
    ],
  ],
  [
    "0008_reminder_settings",
    [
      // The time a learner chose for the daily reminder (ADR 0103), in minutes after local
      // midnight. No row: automatic, after the time they usually practise.
      `create table reminder_settings (
        user_id uuid primary key references users(id) on delete cascade,
        minute smallint not null check (minute between 0 and 1439)
      )`,
    ],
  ],
  [
    "0009_league_opt_outs",
    [
      // Learners who said no to leagues (M8, ADR 0122): they join no cohort until they take part
      // again. No row: they take part, as before.
      `create table league_opt_outs (
        user_id uuid primary key references users(id) on delete cascade,
        opted_out_at timestamptz not null default now()
      )`,
    ],
  ],
];
