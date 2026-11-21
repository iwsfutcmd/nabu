import { it } from "vitest";
import { allSentences } from "../src/lesson/index.ts";
import { lexemeIdsOf } from "../src/lesson/lexemes.ts";
import { writtenMeanings } from "../src/story/index.ts";
import { loadCourse } from "./learner-fixtures.ts";
it("probe", () => {
  for (const [id, o] of [["apc", "apc-Arab/standard"], ["apc", "apc-Latn/arabizi"], ["es", undefined], ["uz", "uz-Latn/standard"], ["fa", undefined], ["hbo", undefined], ["chg", undefined], ["grc", undefined]] as const) {
    const c = loadCourse(id, o);
    const shapes = new Map<string, Set<string>>();
    const texts = new Map<string, unknown>();
    for (const s of allSentences(c)) {
      const t = s.forms[c.orthography]?.text;
      if (t === undefined) continue;
      for (const tok of t.tokens) {
        if (tok.kind !== "word") continue;
        const n = lexemeIdsOf(tok).length;
        if (n === 0) continue;
        const set = shapes.get(tok.surface) ?? new Set();
        set.add(n === 1 ? "whole" : "part");
        shapes.set(tok.surface, set);
        texts.set(tok.surface, { ...t, tokens: [tok] });
      }
    }
    const both = [...shapes].filter(([, v]) => v.size === 2).map(([k]) => k);
    for (const w of both.slice(0, 4)) {
      const ms = writtenMeanings(c, texts.get(w) as never);
      console.log(id, w, JSON.stringify(ms.map((m) => [m.glosses.map((g) => `${g.id}/${g.span}`), m.form?.id])));
    }
  }
});
