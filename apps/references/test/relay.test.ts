import { describe, expect, it } from "vitest";
import { SHORTCUT } from "../src/drive.ts";
import { handle, MAX_UPLOAD, type Deps, type Env } from "../src/relay.ts";
import { fakeGoogle } from "./fake-google.ts";

const KEY = "relay-key-relay-key-relay-key-relay-key";

const setup = (env: Partial<Env> = {}, options: { pageSize?: number } = {}) => {
  const google = fakeGoogle(options);
  const elsewhere = google.folder(null, "Private");
  const diary = google.file(elsewhere, "diary.txt", "not for the relay");
  const root = google.folder(null, "nabu");
  const grammars = google.folder(root, "grammars");
  const kline = google.file(grammars, "kline-2022.pdf", "%PDF-kline");
  const shortcut = google.add(root, "to-private", SHORTCUT);
  let clock = 1_000_000;
  const fullEnv: Env = {
    RELAY_KEY: KEY,
    ROOT_FOLDER_ID: root,
    GOOGLE_CLIENT_ID: "client",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_REFRESH_TOKEN: "refresh-1",
    ...env,
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
    ids: { root, grammars, kline, elsewhere, diary, shortcut },
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
    const { call, google } = setup();
    expect((await call("POST", `/v1/mkdir?path=${q("dictionaries/apc/scans")}`)).status).toBe(200);
    expect((await call("POST", `/v1/mkdir?path=${q("dictionaries/apc")}`)).status).toBe(200);
    expect([...google.nodes.values()].filter((n) => n.name === "apc")).toHaveLength(1);
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
