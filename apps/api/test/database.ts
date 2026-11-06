/**
 * A fresh database for one test file. In-memory PGlite by default; with NABU_TEST_DATABASE_URL
 * (postgres://… to a server the tests may create databases on), a new Postgres database that is
 * dropped again on close. CI runs the API tests both ways, so the SQL is checked on real Postgres
 * as well as on the PGlite that development and the other tests use.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { openDatabase, type Database } from "../src/db/index.ts";

export const postgresUrl = (): string | undefined => {
  const url = process.env["NABU_TEST_DATABASE_URL"];
  return url === undefined || url === "" ? undefined : url;
};

const admin = async <T>(url: string, run: (client: pg.Client) => Promise<T>): Promise<T> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

export const testDatabase = async (): Promise<Database> => {
  const url = postgresUrl();
  if (url === undefined) return openDatabase({ pglite: "memory" });
  // Identifiers: a fixed ASCII prefix and a UUID's hex digits, so no quoting questions arise.
  const name = `nabu_test_${randomUUID().split("-").join("")}`;
  await admin(url, (c) => c.query(`create database ${name}`));
  const own = new URL(url);
  own.pathname = `/${name}`;
  const database = await openDatabase({ url: own.toString() });
  return {
    db: database.db,
    close: async () => {
      await database.close();
      await admin(url, (c) => c.query(`drop database if exists ${name} with (force)`));
    },
  };
};
