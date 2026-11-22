/**
 * The lexicon's own files beside the app (lexicon-source.ts): what the dev and preview servers serve
 * at lexicon-source/<course>.json is each course's lexemes.yaml and language.yaml, parsed, nothing
 * dropped; an unknown course, or a path that climbs out, is a 404, never the app's page; and the
 * static site gets the same files.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { coursesWithLexicon, lexiconSourceMiddleware, writeLexiconSource } from "../../lexicon-source.ts";

const ROOT = resolve(import.meta.dirname, "../../../..");

interface Answer {
  readonly status: number | "next";
  readonly type?: string | undefined;
  readonly body?: string | undefined;
}

const get = (url: string): Answer => {
  let answer: Answer = { status: "next" };
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    end: (body: string) => {
      answer = { status: res.statusCode, type: headers["Content-Type"], body };
    },
  };
  lexiconSourceMiddleware(ROOT)({ url } as IncomingMessage, res as unknown as ServerResponse, () => undefined);
  return answer;
};

const yamlOf = (path: string): unknown => parse(readFileSync(join(ROOT, path), "utf8"));

describe("lexicon-source", () => {
  it("serves every course's lexicon files, parsed as they are", () => {
    const courses = coursesWithLexicon(ROOT);
    expect(courses).toEqual(expect.arrayContaining(["apc", "chg", "es", "fa", "grc", "hbo", "lzh", "tok", "uz", "yue"]));
    for (const course of courses) {
      const answer = get(`/nabu/lexicon-source/${course}.json?v=1`);
      expect(answer.status, course).toBe(200);
      expect(answer.type).toBe("application/json");
      const lexicon = (yamlOf(`courses/${course}/course.yaml`) as { lexicon: string }).lexicon;
      expect(JSON.parse(answer.body ?? "")).toEqual({ course, lexicon, lexemes: yamlOf(`lexicons/${lexicon}/lexemes.yaml`), language: yamlOf(`lexicons/${lexicon}/language.yaml`) });
    }
  });

  it("answers 404 for an unknown course and refuses paths that climb out", () => {
    for (const url of [
      "/lexicon-source/nope.json",
      "/lexicon-source/es",
      "/lexicon-source/es.yaml",
      "/lexicon-source/../package.json",
      "/lexicon-source/..%2F..%2Fpackage.json",
      "/lexicon-source/%2e%2e/courses/es/course.yaml",
      "/lexicon-source/es.json/../../package.json",
      "/lexicon-source/%E0%A4%A.json",
    ]) {
      expect(get(url).status, url).toBe(404);
    }
    // Anything else goes on to the app.
    expect(get("/bundles/es/manifest.json").status).toBe("next");
  });

  it("writes the same files for a static site", () => {
    const out = mkdtempSync(join(tmpdir(), "lexicon-source-"));
    try {
      const written = writeLexiconSource(out, ROOT);
      expect(written).toEqual(coursesWithLexicon(ROOT));
      for (const course of written) expect(readFileSync(join(out, `${course}.json`), "utf8")).toBe(get(`/lexicon-source/${course}.json`).body);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
