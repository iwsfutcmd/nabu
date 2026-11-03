/**
 * The database: Postgres when DATABASE_URL is set, otherwise PGlite (Postgres
 * compiled to WASM, in process) in a directory or in memory. Development and
 * tests need no server; production uses real Postgres. Both speak the same SQL.
 */
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import pg from "pg";
import { MIGRATIONS } from "./migrations.ts";
import * as schema from "./schema.ts";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  readonly db: Db;
  readonly close: () => Promise<void>;
}

export interface DatabaseOptions {
  /** postgres://… for Postgres. */
  readonly url?: string | undefined;
  /** A PGlite data directory, or "memory". Ignored when `url` is set. */
  readonly pglite?: string | undefined;
}

export const migrate = async (db: Db): Promise<void> => {
  await db.execute(sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await db.select({ name: schema.schemaMigrations.name }).from(schema.schemaMigrations)).map((r) => r.name));
  for (const [name, statements] of MIGRATIONS) {
    if (applied.has(name)) continue;
    await db.transaction(async (tx) => {
      for (const statement of statements) await tx.execute(sql.raw(statement));
      await tx.insert(schema.schemaMigrations).values({ name });
    });
  }
};

export const openDatabase = async (options: DatabaseOptions = {}): Promise<Database> => {
  if (options.url !== undefined && options.url !== "") {
    const pool = new pg.Pool({ connectionString: options.url });
    const db = drizzleNodePg(pool, { schema }) as unknown as Db;
    await migrate(db);
    return { db, close: () => pool.end() };
  }
  const dir = options.pglite;
  const client = dir === undefined || dir === "memory" ? new PGlite() : new PGlite(dir);
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  await migrate(db);
  return { db, close: () => client.close() };
};

export { schema };
