import { describe, expect, it } from "vitest";
import { SHORTCUT } from "../src/drive.ts";
import { DRIVE_BUDGET } from "../src/batch.ts";
import { handle, MAX_UPLOAD, type Deps, type Env } from "../src/relay.ts";
import { fakeGoogle } from "./fake-google.ts";

const KEY = "relay-key-relay-key-relay-key-relay-key";

type Ids = { readonly root: string; readonly books: string };

const setup = (env: Partial<Env> | ((ids: Ids) => Partial<Env>) = {}, options: { pageSize?: number } = {}) => {
  const google = fakeGoogle(options);
  const elsewhere = google.folder(null, "Private");
  const diary = google.file(elsewhere, "diary.txt", "not for the relay");
  const root = google.folder(null, "nabu");
  const grammars = google.folder(root, "grammars");
  const kline = google.file(grammars, "kline-2022.pdf", "%PDF-kline");
  const shortcut = google.add(root, "to-private", SHORTCUT);
  // Outside the nabu folder: a library, and papers that are no one's business.
  const books = google.folder(null, "books");
  const sem = google.folder(google.folder(books, "ling"), "sem");
  const apc = google.folder(sem, "apc");
  const klineBook = google.file(apc, "Kline - 2022 - The fundamentals of Lebanese grammar.pdf", "%PDF-kline");
  const personal = google.folder(null, "_personal");
  const statements = google.file(personal, "Kline statements.pdf", "private");
  let clock = 1_000_000;
  const fullEnv: Env = {
    RELAY_KEY: KEY,
    ROOT_FOLDER_ID: root,
    GOOGLE_CLIENT_ID: "client",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_REFRESH_TOKEN: "refresh-1",
    ...(typeof env === "function" ? env({ root, books }) : env),
  };
  const deps: Deps = {
    fetch: google.fetch,
    now: () => clock,
    random: (size) => new Uint8Array(size).fill(7),
    cell: { token: null, expires: 0 },
  };
  const call = (
    method: string,
    target: string,
    init: { headers?: Record<string, string>; body?: string } = {},
  ): Promise<Response> =>
    handle(
      new Request(`https://relay.example${target}`, {
        method,
        headers: { authorization: `Bearer ${KEY}`, ...init.headers },
        ...(init.body === undefined ? {} : { body: init.body }),
      }),
      fullEnv,
      deps,
    );
  const put = (target: string, body: string, headers: Record<string, string> = {}) =>
    call("PUT", target, {
      body,
      headers: { "content-type": "text/markdown", "content-length": String(new TextEncoder().encode(body).length), ...headers },
    });
  const tokenRequests = () => google.requests.filter((r) => r.url.startsWith("https://oauth2.googleapis.com/")).length;
  return {
    google,
    call,
    put,
    tokenRequests,
    ids: { root, grammars, kline, elsewhere, diary, shortcut, books, sem, apc, klineBook, personal, statements },
    advance: (ms: number) => {
      clock += ms;
    },
  };
};

const q = (path: string) => encodeURIComponent(path);

describe("the key", () => {
  it("is required, and must be the relay's", async () => {
    const { call } = setup();
    const missing = await setup().call("GET", "/v1/list", { headers: { authorization: "" } });
    expect(missing.status).toBe(401);
    expect((await call("GET", "/v1/list", { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
  });

  it("must be long, or the relay refuses to run", async () => {
    const response = await setup({ RELAY_KEY: "short" }).call("GET", "/v1/list");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "misconfigured" });
  });

  it("answers unknown routes and methods plainly", async () => {
    const { call } = setup();
    expect((await call("GET", "/v1/nothing")).status).toBe(404);
    const wrong = await call("DELETE", "/v1/file?path=x");
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("GET, PUT");
  });
});

describe("reading", () => {
  it("names the account and the folder", async () => {
    const response = await setup().call("GET", "/v1/status");
    expect(await response.json()).toEqual({
      account: "owner@example.com",
      folder: expect.objectContaining({ name: "nabu", kind: "folder" }) as unknown,
    });
  });

  it("lists a folder, shortcuts included but marked", async () => {
    const { call } = setup();
    const root = (await (await call("GET", "/v1/list")).json()) as { entries: { name: string; kind: string }[] };
    expect(root.entries.map((e) => [e.name, e.kind])).toEqual([
      ["grammars", "folder"],
      ["to-private", "shortcut"],
    ]);
    const grammars = (await (await call("GET", "/v1/list?path=grammars")).json()) as { entries: unknown[] };
    expect(grammars.entries).toEqual([
      expect.objectContaining({ name: "kline-2022.pdf", kind: "file", size: 10, md5: expect.any(String) as unknown }),
    ]);
  });

  it("lists every page of a large folder", async () => {
    const { call, google, ids } = setup({}, { pageSize: 2 });
    for (const name of ["a.pdf", "b.pdf", "c.pdf"]) google.file(ids.grammars, name, name);
    const listed = (await (await call("GET", "/v1/list?path=grammars")).json()) as { entries: unknown[] };
    expect(listed.entries).toHaveLength(4);
  });

  it("downloads a file whole or by range", async () => {
    const { call } = setup();
    const whole = await call("GET", `/v1/file?path=${q("grammars/kline-2022.pdf")}`);
    expect(whole.status).toBe(200);
    expect(await whole.text()).toBe("%PDF-kline");
    expect(whole.headers.get("x-md5")).toMatch(/^md5-/u);
    const part = await call("GET", `/v1/file?path=${q("grammars/kline-2022.pdf")}`, { headers: { range: "bytes=1-3" } });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe("PDF");
    expect(part.headers.get("content-range")).toBe("bytes 1-3/10");
  });

  it("finds a name Drive holds in NFD by its NFC spelling, and reports it in NFC", async () => {
    const { call, google, ids } = setup();
    google.file(ids.grammars, "Café.pdf", "x");
    const found = await call("GET", `/v1/stat?path=${q("grammars/Café.pdf")}`);
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ name: "Café.pdf" });
  });

  it("lists and finds catalogue names without their control characters", async () => {
    const { call, google, ids } = setup();
    google.file(ids.grammars, "\u0098The\u009c fundamentals of Lebanese grammar.pdf", "%PDF-fundamentals");
    const listed = (await (await call("GET", "/v1/list?path=grammars")).json()) as { entries: { name: string }[] };
    expect(listed.entries.map((e) => e.name)).toContain("The fundamentals of Lebanese grammar.pdf");
    for (const name of ["The fundamentals of Lebanese grammar.pdf", "\u0098The\u009c fundamentals of Lebanese grammar.pdf"]) {
      const read = await call("GET", `/v1/file?path=${q(`grammars/${name}`)}`);
      expect(await read.text()).toBe("%PDF-fundamentals");
    }
    expect((await call("GET", `/v1/stat?path=${q("grammars/\u0098")}`)).status).toBe(400);
  });

  it("gives the name Drive holds as rawName, only where it differs", async () => {
    const { call, google, ids } = setup();
    google.file(ids.grammars, "\u0098The\u009c fundamentals of Lebanese grammar.pdf", "%PDF-fundamentals");
    google.file(ids.grammars, "Cafe\u0301.pdf", "x");
    const listed = (await (await call("GET", "/v1/list?path=grammars")).json()) as {
      entries: { name: string; rawName?: string }[];
    };
    const rawNames = new Map(listed.entries.map((e) => [e.name, e]));
    expect(rawNames.get("kline-2022.pdf")).not.toHaveProperty("rawName");
    expect(rawNames.get("The fundamentals of Lebanese grammar.pdf")).toMatchObject({
      rawName: "\u0098The\u009c fundamentals of Lebanese grammar.pdf",
    });
    expect(rawNames.get("Caf\u00e9.pdf")).toMatchObject({ rawName: "Cafe\u0301.pdf" });
    const found = await call("GET", `/v1/stat?path=${q("grammars/Caf\u00e9.pdf")}`);
    expect(await found.json()).toMatchObject({ name: "Caf\u00e9.pdf", rawName: "Cafe\u0301.pdf" });
  });

  it("exports Google-native files", async () => {
    const { call, google, ids } = setup();
    google.add(ids.root, "notes", "application/vnd.google-apps.document");
    google.add(ids.root, "sketch", "application/vnd.google-apps.drawing");
    expect(await (await call("GET", "/v1/file?path=notes")).text()).toBe("exported notes as text/markdown");
    const asText = await call("GET", "/v1/file?path=notes&export=text%2Fplain");
    expect(await asText.text()).toBe("exported notes as text/plain");
    expect(await (await call("GET", "/v1/file?path=sketch")).json()).toMatchObject({ error: "export-required" });
  });

  it("refuses paths that climb, and names that are ambiguous", async () => {
    const { call, google, ids } = setup();
    for (const path of ["..", "grammars/../x", "grammars//x", "a/./b"]) {
      expect((await call("GET", `/v1/stat?path=${q(path)}`)).status).toBe(400);
    }
    google.file(ids.grammars, "twin.pdf", "1");
    google.file(ids.grammars, "twin.pdf", "2");
    const twin = await call("GET", `/v1/stat?path=${q("grammars/twin.pdf")}`);
    expect(twin.status).toBe(409);
    expect(await twin.json()).toMatchObject({ error: "ambiguous" });
  });

  it("never follows a shortcut or reaches outside the folder", async () => {
    const { call, google, ids } = setup();
    expect((await call("GET", `/v1/list?path=to-private`)).status).toBe(409);
    expect((await call("GET", `/v1/file?path=${q("to-private/diary.txt")}`)).status).toBe(404);
    expect(await (await call("GET", "/v1/file?path=to-private")).json()).toMatchObject({ error: "is-shortcut" });
    expect((await call("GET", "/v1/file?path=grammars")).status).toBe(409);
    expect((await call("GET", `/v1/file?path=${q("Private/diary.txt")}`)).status).toBe(404);
    const touched = google.requests.map((r) => r.url).join("\n");
    expect(touched).not.toContain(ids.elsewhere);
    expect(touched).not.toContain(ids.diary);
  });
});

describe("writing", () => {
  it("creates a file, then replaces its content in place", async () => {
    const { put, google, ids } = setup();
    const made = await put(`/v1/file?path=${q("notes/kline.md")}&parents=1`, "# Kline 2022\n");
    expect(made.status).toBe(201);
    const note = [...google.nodes.values()].find((n) => n.name === "kline.md");
    expect(note?.mimeType).toBe("text/markdown");
    const notes = [...google.nodes.values()].find((n) => n.name === "notes");
    expect(notes?.parent).toBe(ids.root);
    expect(note?.parent).toBe(notes?.id);
    const replaced = await put(`/v1/file?path=${q("notes/kline.md")}`, "# Kline 2022\n\np. 12: …\n");
    expect(replaced.status).toBe(200);
    expect(google.textOf(note?.id ?? "")).toBe("# Kline 2022\n\np. 12: …\n");
    expect([...google.nodes.values()].filter((n) => n.name === "kline.md")).toHaveLength(1);
  });

  it("needs the folder to exist unless asked to make it", async () => {
    const response = await setup().put(`/v1/file?path=${q("missing/x.md")}`, "x");
    expect(response.status).toBe(404);
  });

  it("does not write over a folder or a Google Doc", async () => {
    const { put, google, ids } = setup();
    expect((await put("/v1/file?path=grammars", "x")).status).toBe(409);
    google.add(ids.root, "doc", "application/vnd.google-apps.document");
    expect(await (await put("/v1/file?path=doc", "x")).json()).toMatchObject({ error: "is-native" });
  });

  it("needs a length, and takes nothing over the limit", async () => {
    const { call, put } = setup();
    const unsized = await call("PUT", "/v1/file?path=x.md", { body: "x" });
    expect(unsized.status).toBe(411);
    expect((await put("/v1/file?path=x.md", "x", { "content-length": String(MAX_UPLOAD + 1) })).status).toBe(413);
  });

  it("makes folders, like mkdir -p", async () => {
    const { call, google, ids } = setup();
    expect((await call("POST", `/v1/mkdir?path=${q("dictionaries/apc/scans")}`)).status).toBe(200);
    expect((await call("POST", `/v1/mkdir?path=${q("dictionaries/apc")}`)).status).toBe(200);
    const made = [...google.nodes.values()].filter((n) => n.name === "apc" && n.parent !== ids.sem);
    expect(made).toHaveLength(1);
    expect(await (await call("POST", `/v1/mkdir?path=${q("grammars/kline-2022.pdf/x")}`)).json()).toMatchObject({
      error: "not-a-folder",
    });
  });

  it("renames and moves", async () => {
    const { call, google, ids } = setup();
    const renamed = await call("POST", `/v1/move?from=${q("grammars/kline-2022.pdf")}&to=${q("grammars/Kline 2022.pdf")}`);
    expect(renamed.status).toBe(200);
    expect(google.nodes.get(ids.kline)?.name).toBe("Kline 2022.pdf");
    const moved = await call("POST", `/v1/move?from=${q("grammars/Kline 2022.pdf")}&to=${q("apc/grammars/Kline 2022.pdf")}&parents=1`);
    expect(moved.status).toBe(200);
    const apcGrammars = google.nodes.get(ids.kline)?.parent ?? "";
    expect(google.nodes.get(apcGrammars)?.name).toBe("grammars");
    expect(apcGrammars).not.toBe(ids.grammars);
  });

  it("cleans a name in place: a file may take its own cleaned name", async () => {
    const { call, google, ids } = setup();
    const marked = google.file(ids.grammars, "\u0098The\u009c fundamentals of Lebanese grammar.pdf", "%PDF-fundamentals");
    const decomposed = google.file(ids.grammars, "Cafe\u0301.pdf", "x");
    const clean = q("grammars/The fundamentals of Lebanese grammar.pdf");
    const cleaned = await call("POST", `/v1/move?from=${clean}&to=${clean}`);
    expect(cleaned.status).toBe(200);
    expect(await cleaned.json()).not.toHaveProperty("rawName");
    expect(google.nodes.get(marked)?.name).toBe("The fundamentals of Lebanese grammar.pdf");
    const composed = await call("POST", `/v1/move?from=${q("grammars/Cafe\u0301.pdf")}&to=${q("grammars/Caf\u00e9.pdf")}`);
    expect(composed.status).toBe(200);
    expect(google.nodes.get(decomposed)?.name).toBe("Caf\u00e9.pdf");
  });

  it("will not move onto something, into itself, or move the folder itself", async () => {
    const { call, put } = setup();
    await put("/v1/file?path=a.md", "a");
    expect((await call("POST", `/v1/move?from=a.md&to=${q("grammars/kline-2022.pdf")}`)).status).toBe(409);
    expect((await call("POST", `/v1/move?from=grammars&to=${q("grammars/inner")}`)).status).toBe(400);
    expect((await call("POST", "/v1/move?from=&to=x")).status).toBe(400);
  });

  it("trashes, and never deletes", async () => {
    const { call, google, ids } = setup();
    const response = await call("POST", `/v1/trash?path=${q("grammars/kline-2022.pdf")}`);
    expect(response.status).toBe(200);
    expect(google.nodes.get(ids.kline)?.trashed).toBe(true);
    const listed = (await (await call("GET", "/v1/list?path=grammars")).json()) as { entries: unknown[] };
    expect(listed.entries).toEqual([]);
    expect((await call("POST", "/v1/trash?path=")).status).toBe(400);
  });
});

describe("batch moves", () => {
  type Result = { from: string; to: string; status: string; error?: string };
  type Answer = { results: Result[]; stopped: string | null; driveCalls: number };
  const batch = async (call: ReturnType<typeof setup>["call"], moves: { from: string; to: string }[]) => {
    const response = await call("POST", "/v1/moves", {
      body: JSON.stringify({ moves, parents: true }),
      headers: { "content-type": "application/json" },
    });
    return { status: response.status, answer: (await response.json()) as Answer };
  };
  const listingsOf = (google: ReturnType<typeof fakeGoogle>, folder: string) =>
    google.requests.filter((r) => decodeURIComponent(r.url).includes(`'${folder}' in parents`)).length;

  it("moves many files in one request, listing each folder once", async () => {
    const { call, google, ids } = setup();
    const names = ["a.pdf", "b.pdf", "c.pdf", "d.pdf"];
    const files = names.map((name) => google.file(ids.grammars, name, name));
    const before = google.requests.length;
    const { status, answer } = await batch(
      call,
      names.map((name) => ({ from: `grammars/${name}`, to: `books/ling/apc/kline-${name}` })),
    );
    expect(status).toBe(200);
    expect(answer.results.map((r) => r.status)).toEqual(["moved", "moved", "moved", "moved"]);
    expect(answer.stopped).toBeNull();
    const apc = google.nodes.get(files[0] ?? "")?.parent ?? "";
    expect(google.nodes.get(apc)?.name).toBe("apc");
    expect(files.map((f) => google.nodes.get(f)?.name)).toEqual(names.map((name) => `kline-${name}`));
    expect(google.nodes.get(files[3] ?? "")?.parent).toBe(apc);
    for (const folder of [ids.root, ids.grammars]) expect(listingsOf(google, folder)).toBeLessThanOrEqual(1);
    expect(answer.driveCalls).toBeLessThanOrEqual(google.requests.length - before);
  });

  it("stops at the first failure and leaves the rest", async () => {
    const { call, google, ids } = setup();
    const kept = google.file(ids.grammars, "z.pdf", "z");
    const { answer } = await batch(call, [
      { from: "grammars/kline-2022.pdf", to: "books/kline.pdf" },
      { from: "grammars/missing.pdf", to: "books/missing.pdf" },
      { from: "grammars/z.pdf", to: "books/z.pdf" },
    ]);
    expect(answer.results.map((r) => [r.status, r.error])).toEqual([
      ["moved", undefined],
      ["failed", "not-found"],
      ["not-attempted", undefined],
    ]);
    expect(answer.stopped).toBe("failure");
    expect(google.nodes.get(kept)?.parent).toBe(ids.grammars);
  });

  it("sees its own moves: two files bound for one name clash", async () => {
    const { call, google, ids } = setup();
    google.file(ids.grammars, "twin.pdf", "x");
    const { answer } = await batch(call, [
      { from: "grammars/kline-2022.pdf", to: "books/same.pdf" },
      { from: "grammars/twin.pdf", to: "books/same.pdf" },
    ]);
    expect(answer.results.map((r) => r.error ?? r.status)).toEqual(["moved", "exists"]);
  });

  it("keeps within the subrequest budget, and finishes when the rest is sent again", async () => {
    const { call, google, ids } = setup();
    const names = Array.from({ length: 70 }, (_, i) => `f${String(i).padStart(2, "0")}.pdf`);
    for (const name of names) google.file(ids.grammars, name, name);
    let todo = names.map((name) => ({ from: `grammars/${name}`, to: `books/all/${name}` }));
    let rounds = 0;
    while (todo.length > 0 && rounds < 5) {
      const { answer } = await batch(call, todo);
      expect(answer.driveCalls).toBeLessThanOrEqual(DRIVE_BUDGET);
      expect(answer.results.some((r) => r.status === "failed")).toBe(false);
      todo = answer.results.filter((r) => r.status === "not-attempted").map(({ from, to }) => ({ from, to }));
      if (todo.length > 0) expect(answer.stopped).toBe("budget");
      rounds += 1;
    }
    expect(todo).toEqual([]);
    expect(rounds).toBeGreaterThan(1);
    const listed = (await (await call("GET", "/v1/list?path=books%2Fall")).json()) as { entries: unknown[] };
    expect(listed.entries).toHaveLength(70);
  });

  it("refuses a malformed batch", async () => {
    const { call } = setup();
    const send = (body: string) => call("POST", "/v1/moves", { body, headers: { "content-type": "application/json" } });
    expect((await send("not json")).status).toBe(400);
    expect((await send(JSON.stringify({ moves: [] }))).status).toBe(400);
    expect((await send(JSON.stringify({ moves: [{ from: "..", to: "x" }] }))).status).toBe(400);
    expect((await send(JSON.stringify({ moves: [{ from: "a" }] }))).status).toBe(400);
  });
});

describe("descriptions", () => {
  type Result = { path: string; status: string; error?: string };
  type Answer = { results: Result[]; stopped: string | null; driveCalls: number };
  const send = async (call: ReturnType<typeof setup>["call"], files: { path: string; description: string }[]) => {
    const response = await call("POST", "/v1/describe", {
      body: JSON.stringify({ files }),
      headers: { "content-type": "application/json" },
    });
    return { status: response.status, answer: (await response.json()) as Answer };
  };

  it("sets many files' descriptions in one request, and clears one with an empty description", async () => {
    const { call, google, ids } = setup();
    const other = google.file(ids.grammars, "b.pdf", "b");
    const { status, answer } = await send(call, [
      { path: "grammars/kline-2022.pdf", description: "lang:apc form:grammar in:en" },
      { path: "grammars/b.pdf", description: "lang:hbo" },
    ]);
    expect(status).toBe(200);
    expect(answer.results.map((r) => r.status)).toEqual(["described", "described"]);
    expect(google.nodes.get(ids.kline)?.description).toBe("lang:apc form:grammar in:en");
    expect(google.nodes.get(other)?.description).toBe("lang:hbo");
    await send(call, [{ path: "grammars/b.pdf", description: "" }]);
    expect(google.nodes.get(other)?.description).toBe("");
    expect(google.nodes.get(ids.kline)?.name).toBe("kline-2022.pdf");
    // Entries carry a description where there is one, so a caller can log what it replaces.
    const listed = (await (await call("GET", "/v1/list?path=grammars")).json()) as { entries: { name: string; description?: string }[] };
    expect(listed.entries.find((e) => e.name === "kline-2022.pdf")?.description).toBe("lang:apc form:grammar in:en");
    expect(listed.entries.find((e) => e.name === "b.pdf")).not.toHaveProperty("description");
  });

  it("stops at the first failure, and keeps within the subrequest budget", async () => {
    const { call, google, ids } = setup();
    const { answer } = await send(call, [
      { path: "grammars/kline-2022.pdf", description: "a" },
      { path: "grammars/missing.pdf", description: "b" },
      { path: "grammars/kline-2022.pdf", description: "c" },
    ]);
    expect(answer.results.map((r) => r.error ?? r.status)).toEqual(["described", "not-found", "not-attempted"]);
    expect(google.nodes.get(ids.kline)?.description).toBe("a");
    const names = Array.from({ length: 80 }, (_, i) => `f${String(i).padStart(2, "0")}.pdf`);
    for (const name of names) google.file(ids.grammars, name, name);
    const { answer: many } = await send(call, names.map((name) => ({ path: `grammars/${name}`, description: "x" })));
    expect(many.driveCalls).toBeLessThanOrEqual(DRIVE_BUDGET);
    expect(many.stopped).toBe("budget");
    expect(many.results.filter((r) => r.status === "described").length).toBeGreaterThan(30);
  });

  it("refuses a malformed batch, a root, and a description too long", async () => {
    const { call } = setup();
    const raw = (body: string) => call("POST", "/v1/describe", { body, headers: { "content-type": "application/json" } });
    expect((await raw("not json")).status).toBe(400);
    expect((await raw(JSON.stringify({ files: [] }))).status).toBe(400);
    expect((await raw(JSON.stringify({ files: [{ path: "", description: "x" }] }))).status).toBe(400);
    expect((await raw(JSON.stringify({ files: [{ path: "a.pdf" }] }))).status).toBe(400);
    expect((await raw(JSON.stringify({ files: [{ path: "a.pdf", description: "x".repeat(4001) }] }))).status).toBe(400);
    const roots = setup(twoRoots);
    const { answer } = await send(roots.call, [{ path: "books", description: "x" }]);
    expect(answer.results[0]?.error).toBe("not-in-a-root");
  });
});

describe("Google's tokens", () => {
  it("refreshes once and reuses the access token", async () => {
    const { call, tokenRequests } = setup();
    await call("GET", "/v1/list");
    await call("GET", "/v1/list?path=grammars");
    expect(tokenRequests()).toBe(1);
  });

  it("refreshes again when the token lapses or is refused", async () => {
    const { call, google, tokenRequests, advance } = setup();
    await call("GET", "/v1/list");
    advance(3600 * 1000);
    await call("GET", "/v1/list");
    expect(tokenRequests()).toBe(2);
    google.expireAccessTokens();
    expect((await call("GET", "/v1/list")).status).toBe(200);
    expect(tokenRequests()).toBe(3);
  });

  it("says so when the sign-in has been revoked, or never happened", async () => {
    const { call, google } = setup();
    google.revoke();
    expect(await (await call("GET", "/v1/list")).json()).toMatchObject({ error: "sign-in-expired" });
    expect(await (await setup({ GOOGLE_REFRESH_TOKEN: "" }).call("GET", "/v1/list")).json()).toEqual({
      error: "not-signed-in",
    });
  });
});

describe("signing in", () => {
  const signedOut = () => setup({ GOOGLE_REFRESH_TOKEN: "" });

  it("is closed while signed in", async () => {
    expect((await setup().call("GET", "/oauth/start")).status).toBe(409);
  });

  it("sends the owner to Google with a state bound to a cookie, and shows the token for the account", async () => {
    const { call } = signedOut();
    const start = await call("GET", "/oauth/start");
    expect(start.status).toBe(302);
    const location = new URL(start.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("redirect_uri")).toBe("https://relay.example/oauth/callback");
    expect(location.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive");
    expect(location.searchParams.get("access_type")).toBe("offline");
    const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    expect(cookie).toMatch(/^__Host-nabu-oauth=/u);
    const state = location.searchParams.get("state") ?? "";

    const done = await call("GET", `/oauth/callback?code=good-code&state=${q(state)}`, { headers: { cookie } });
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ account: "owner@example.com", GOOGLE_REFRESH_TOKEN: "refresh-new" });

    const otherBrowser = await call("GET", `/oauth/callback?code=good-code&state=${q(state)}`, {
      headers: { cookie: "__Host-nabu-oauth=someone-else" },
    });
    expect(await otherBrowser.json()).toMatchObject({ error: "bad-state" });
  });

  it("lets a state lapse after ten minutes", async () => {
    const { call, advance } = signedOut();
    const start = await call("GET", "/oauth/start");
    const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const state = new URL(start.headers.get("location") ?? "").searchParams.get("state") ?? "";
    advance(11 * 60 * 1000);
    const late = await call("GET", `/oauth/callback?code=good-code&state=${q(state)}`, { headers: { cookie } });
    expect(await late.json()).toMatchObject({ error: "state-expired" });
  });

  it("passes on Google's refusal", async () => {
    const response = await signedOut().call("GET", "/oauth/callback?error=access_denied");
    expect(await response.json()).toMatchObject({ error: "google-refused", detail: "access_denied" });
  });
});

describe("the pages Google asks for", () => {
  it("serves a home page, a privacy policy and terms, without the key", async () => {
    const { call } = setup({ GOOGLE_REFRESH_TOKEN: "" });
    for (const [path, words] of [
      ["/", "one user, its owner"],
      ["/privacy", "Limited Use requirements"],
      ["/terms", "without warranty"],
    ] as const) {
      const response = await call("GET", path, { headers: { authorization: "" } });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      const html = await response.text();
      expect(html).toContain('<html lang="en" dir="ltr">');
      expect(html).toContain(words);
    }
    expect((await call("POST", "/")).status).toBe(404);
  });
});

const KLINE = "books/ling/sem/apc/Kline - 2022 - The fundamentals of Lebanese grammar.pdf";
const twoRoots = (ids: Ids): Partial<Env> => ({ ROOTS: `nabu=${ids.root},books=${ids.books}`, ROOT_FOLDER_ID: "" });

describe("two roots", () => {
  it("lists the roots at the top, by their names, without asking Drive", async () => {
    const { call, google } = setup(twoRoots);
    const top = (await (await call("GET", "/v1/list")).json()) as { entries: { name: string; kind: string }[] };
    expect(top.entries.map((e) => [e.name, e.kind])).toEqual([
      ["nabu", "folder"],
      ["books", "folder"],
    ]);
    expect(google.requests.filter((r) => r.url.includes("/drive/v3/files"))).toEqual([]);
  });

  it("reads, writes and moves inside the roots and between them", async () => {
    const { call, put, google, ids } = setup(twoRoots);
    expect(await (await call("GET", `/v1/file?path=${q(KLINE)}`)).text()).toBe("%PDF-kline");
    expect((await put(`/v1/file?path=${q("nabu/notes/apc/kline.md")}&parents=1`, "# Kline\n")).status).toBe(201);
    const notes = [...google.nodes.values()].find((n) => n.name === "notes");
    expect(notes?.parent).toBe(ids.root);
    const moved = await call("POST", `/v1/move?from=${q("nabu/grammars/kline-2022.pdf")}&to=${q("books/ling/sem/apc/kline-copy.pdf")}`);
    expect(moved.status).toBe(200);
    expect(google.nodes.get(ids.kline)?.parent).toBe(ids.apc);
  });

  it("reaches nothing outside the roots, and never makes, moves or trashes a root", async () => {
    const { call, put, google, ids } = setup(twoRoots);
    expect((await call("GET", `/v1/list?path=_personal`)).status).toBe(404);
    expect((await call("GET", `/v1/stat?path=${q("Private/diary.txt")}`)).status).toBe(404);
    for (const response of [
      await call("POST", "/v1/mkdir?path=elsewhere"),
      await put("/v1/file?path=loose.md", "x"),
      await call("POST", "/v1/trash?path=books"),
      await call("POST", `/v1/move?from=nabu&to=${q("books/nabu")}`),
      await call("POST", `/v1/move?from=${q("books/ling")}&to=ling`),
    ]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "not-in-a-root" });
    }
    expect(google.nodes.get(ids.books)?.trashed).toBe(false);
    expect(google.nodes.get(ids.root)?.parent).toBe(null);
    const touched = google.requests.map((r) => r.url).join("\n");
    for (const outside of [ids.personal, ids.statements, ids.elsewhere, ids.diary]) expect(touched).not.toContain(outside);
  });

  it("moves in a batch between roots", async () => {
    const { call, google, ids } = setup(twoRoots);
    const response = await call("POST", "/v1/moves", {
      body: JSON.stringify({ moves: [{ from: KLINE, to: "nabu/grammars/Kline 2022.pdf" }] }),
      headers: { "content-type": "application/json" },
    });
    expect(await response.json()).toMatchObject({ results: [{ status: "moved" }], stopped: null });
    expect(google.nodes.get(ids.klineBook)?.parent).toBe(ids.grammars);
  });

  it("names each root in the status, and a wrong id there", async () => {
    const good = (await (await setup(twoRoots).call("GET", "/v1/status")).json()) as unknown;
    expect(good).toMatchObject({
      account: "owner@example.com",
      roots: [
        { name: "nabu", folder: { kind: "folder" } },
        { name: "books", folder: { kind: "folder" } },
      ],
    });
    const wrong = (await (await setup((ids) => ({ ROOTS: `nabu=${ids.root},books=nosuchfolder` })).call("GET", "/v1/status")).json()) as unknown;
    expect(wrong).toMatchObject({ roots: [{ name: "nabu" }, { name: "books", error: "not-found" }] });
  });

  it("refuses roots it cannot read", async () => {
    for (const roots of ["nabu", "nabu=a=b", "nabu=x,nabu=y", "../x=a", "a=1,b=2,c=3,d=4,e=5"]) {
      const response = await setup({ ROOTS: roots }).call("GET", "/v1/list");
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: "misconfigured" });
    }
  });
});

describe("finding a book by name", () => {
  it("finds files inside the roots, with their paths, and nothing outside them", async () => {
    const { call } = setup(twoRoots);
    const response = await call("GET", "/v1/find?q=kline");
    const body = (await response.json()) as { results: { path: string; kind: string }[]; truncated: boolean };
    expect(body.results.map((r) => r.path)).toEqual([KLINE, "nabu/grammars/kline-2022.pdf"]);
    expect(JSON.stringify(body)).not.toContain("statements");
    expect(body.truncated).toBe(false);
  });

  it("takes every word, any case, and an `in` to look within", async () => {
    const { call } = setup(twoRoots);
    const both = (await (await call("GET", "/v1/find?q=KLINE%20lebanese")).json()) as { results: { path: string }[] };
    expect(both.results.map((r) => r.path)).toEqual([KLINE]);
    const inside = (await (await call("GET", "/v1/find?q=kline&in=nabu")).json()) as { results: { path: string }[] };
    expect(inside.results.map((r) => r.path)).toEqual(["nabu/grammars/kline-2022.pdf"]);
    expect((await call("GET", "/v1/find?q=%20")).status).toBe(400);
  });

  it("gives paths inside the one root when there is one", async () => {
    const body = (await (await setup().call("GET", "/v1/find?q=kline")).json()) as { results: { path: string }[] };
    expect(body.results.map((r) => r.path)).toEqual(["grammars/kline-2022.pdf"]);
  });

  it("quotes the words it searches for", async () => {
    const { call, google } = setup(twoRoots);
    await call("GET", `/v1/find?q=${q("o'brien back\\slash")}`);
    const search = google.requests.find((r) => r.url.includes("name+contains") || r.url.includes("name%20contains"));
    const sent = new URL(search?.url ?? "https://x").searchParams.get("q");
    expect(sent).toBe("name contains 'o\\'brien' and name contains 'back\\\\slash' and trashed = false");
  });
});
