/**
 * A stand-in for Google's token endpoint and the parts of Drive API v3 the relay calls, enough to
 * check the relay's behaviour. It is not Drive: it answers only the requests the relay makes.
 */
import type { Fetch } from "../src/drive.ts";

const FOLDER = "application/vnd.google-apps.folder";

type Node = {
  id: string;
  name: string;
  mimeType: string;
  parent: string | null;
  content: Uint8Array<ArrayBuffer>;
  trashed: boolean;
  modifiedTime: string;
};

type Pending = { readonly create?: { name: string; parent: string; mimeType: string }; readonly update?: string };

const md5Of = (bytes: Uint8Array): string => `md5-${bytes.length}-${bytes.reduce((a, b) => (a * 31 + b) % 1_000_003, 7)}`;

export const fakeGoogle = (options: { readonly email?: string; readonly pageSize?: number } = {}) => {
  const nodes = new Map<string, Node>();
  const pending = new Map<string, Pending>();
  const requests: { method: string; url: string }[] = [];
  const valid = new Set<string>();
  let refreshToken = "refresh-1";
  let counter = 0;
  const id = (): string => `id${++counter}`;
  const pageSize = options.pageSize ?? 1000;

  const add = (parent: string | null, name: string, mimeType: string, content = ""): string => {
    const key = id();
    nodes.set(key, {
      id: key,
      name,
      mimeType,
      parent,
      content: new TextEncoder().encode(content),
      trashed: false,
      modifiedTime: "2026-11-06T00:00:00.000Z",
    });
    return key;
  };

  const meta = (node: Node) => ({
    id: node.id,
    name: node.name,
    mimeType: node.mimeType,
    modifiedTime: node.modifiedTime,
    ...(node.parent === null ? {} : { parents: [node.parent] }),
    ...(node.mimeType.startsWith("application/vnd.google-apps.")
      ? {}
      : { size: String(node.content.length), md5Checksum: md5Of(node.content) }),
  });

  const reply = (status: number, body?: unknown, headers: Record<string, string> = {}): Response =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });

  const formOf = (init: RequestInit | undefined): URLSearchParams =>
    new URLSearchParams(typeof init?.body === "string" ? init.body : "");

  const jsonOf = (init: RequestInit | undefined): Record<string, unknown> =>
    typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};

  const bytesOf = (init: RequestInit | undefined): Uint8Array<ArrayBuffer> =>
    init?.body instanceof ArrayBuffer ? new Uint8Array(init.body) : new Uint8Array();

  const token = (init: RequestInit | undefined): Response => {
    const form = formOf(init);
    const grant = form.get("grant_type");
    if (grant === "refresh_token" && form.get("refresh_token") === refreshToken) {
      const access = `access-${++counter}`;
      valid.add(access);
      return reply(200, { access_token: access, expires_in: 3600 });
    }
    if (grant === "authorization_code" && form.get("code") === "good-code") {
      const access = `access-${++counter}`;
      valid.add(access);
      return reply(200, { access_token: access, refresh_token: "refresh-new", expires_in: 3600 });
    }
    return reply(400, { error: "invalid_grant" });
  };

  const route = (input: string, init?: RequestInit): Response => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    requests.push({ method, url: input });
    if (url.origin === "https://oauth2.googleapis.com" && url.pathname === "/token") return token(init);
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    if (!valid.has(auth.replace(/^Bearer /u, ""))) return reply(401, { error: "unauthenticated" });
    const path = url.pathname;
    const params = url.searchParams;

    if (path === "/drive/v3/about") return reply(200, { user: { emailAddress: options.email ?? "owner@example.com" } });

    if (path === "/drive/v3/files" && method === "GET" && (params.get("q") ?? "").startsWith("name contains")) {
      // Drive's name search: every word starts a word of the name, in any case.
      const words = [...(params.get("q") ?? "").matchAll(/name contains '((?:[^'\\]|\\.)*)'/gu)].map((m) =>
        (m[1] ?? "").replace(/\\(.)/gu, "$1").toLocaleLowerCase("und"),
      );
      const tokens = (name: string) => name.toLocaleLowerCase("und").split(/[^\p{L}\p{N}]+/u);
      const hits = [...nodes.values()].filter(
        (n) => !n.trashed && words.every((word) => tokens(n.name).some((token) => token.startsWith(word))),
      );
      return reply(200, { files: hits.slice(0, Number(params.get("pageSize") ?? "100")).map(meta) });
    }

    if (path === "/drive/v3/files" && method === "GET") {
      const parent = /^'([^']+)' in parents and trashed = false$/u.exec(params.get("q") ?? "")?.[1];
      const children = [...nodes.values()].filter((n) => n.parent === parent && !n.trashed);
      const start = Number(params.get("pageToken") ?? "0");
      const page = children.slice(start, start + pageSize);
      const next = start + pageSize < children.length ? { nextPageToken: String(start + pageSize) } : {};
      return reply(200, { files: page.map(meta), ...next });
    }

    if (path === "/drive/v3/files" && method === "POST") {
      const body = jsonOf(init) as { name: string; mimeType: string; parents: string[] };
      const node = nodes.get(add(body.parents[0] ?? null, body.name, body.mimeType));
      return node ? reply(200, meta(node)) : reply(500);
    }

    const upload = /^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/u.exec(path);
    if (upload) {
      const target = upload[1];
      if (params.has("upload_id")) {
        const session = pending.get(params.get("upload_id") ?? "");
        if (!session || method !== "PUT") return reply(404);
        const bytes = bytesOf(init);
        let node: Node | undefined;
        if (session.create) {
          node = nodes.get(add(session.create.parent, session.create.name, session.create.mimeType));
        } else if (session.update) {
          node = nodes.get(session.update);
        }
        if (!node) return reply(404);
        node.content = bytes;
        return reply(200, meta(node));
      }
      const sessionId = id();
      if (method === "POST" && target === undefined) {
        const body = jsonOf(init) as { name: string; parents: string[]; mimeType: string };
        pending.set(sessionId, { create: { name: body.name, parent: body.parents[0] ?? "", mimeType: body.mimeType } });
      } else if (method === "PATCH" && target !== undefined && nodes.has(target)) {
        pending.set(sessionId, { update: target });
      } else {
        return reply(404);
      }
      return reply(200, undefined, {
        location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${sessionId}`,
      });
    }

    const exported = /^\/drive\/v3\/files\/([^/]+)\/export$/u.exec(path);
    if (exported) {
      const node = nodes.get(exported[1] ?? "");
      if (!node || node.trashed) return reply(404);
      return new Response(`exported ${node.name} as ${params.get("mimeType")}`, {
        status: 200,
        headers: { "content-type": params.get("mimeType") ?? "" },
      });
    }

    const file = /^\/drive\/v3\/files\/([^/]+)$/u.exec(path);
    const node = file ? nodes.get(file[1] ?? "") : undefined;
    if (!node) return reply(404, { error: "notFound" });
    if (method === "GET" && params.get("alt") === "media") {
      const range = /^bytes=(\d+)-(\d+)$/u.exec(new Headers(init?.headers).get("range") ?? "");
      if (range) {
        const [from, to] = [Number(range[1]), Number(range[2])];
        const part = node.content.slice(from, to + 1);
        return new Response(part, {
          status: 206,
          headers: {
            "content-type": node.mimeType,
            "content-length": String(part.length),
            "content-range": `bytes ${from}-${from + part.length - 1}/${node.content.length}`,
          },
        });
      }
      return new Response(node.content, {
        status: 200,
        headers: { "content-type": node.mimeType, "content-length": String(node.content.length) },
      });
    }
    if (method === "GET") return reply(200, meta(node));
    if (method === "PATCH") {
      const body = jsonOf(init) as { name?: string; trashed?: boolean };
      if (params.has("removeParents")) {
        if (node.parent !== params.get("removeParents")) return reply(400, { error: "notAParent" });
        node.parent = params.get("addParents");
      }
      if (body.name !== undefined) node.name = body.name;
      if (body.trashed === true) node.trashed = true;
      return reply(200, meta(node));
    }
    return reply(400);
  };

  const fetchFn: Fetch = (input, init) => Promise.resolve(route(input, init));

  return {
    fetch: fetchFn,
    nodes,
    requests,
    add,
    folder: (parent: string | null, name: string) => add(parent, name, FOLDER),
    file: (parent: string, name: string, content: string, mimeType = "application/pdf") =>
      add(parent, name, mimeType, content),
    revoke: () => {
      refreshToken = "revoked";
      valid.clear();
    },
    expireAccessTokens: () => valid.clear(),
    textOf: (key: string) => new TextDecoder().decode(nodes.get(key)?.content),
  };
};
