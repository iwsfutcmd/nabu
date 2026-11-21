import { it } from "vitest";
import { placedParts } from "../src/learner/index.ts";
import { lessonNodes } from "../src/lesson/index.ts";
import { loadCourse } from "../test/learner-fixtures.ts";
it("q", () => {
  const uz = loadCourse("uz", "uz-Latn/standard");
  const lessons = lessonNodes(uz);
  const at = lessons.findIndex((n) => n.unit.id === uz.units[5]?.id);
  const parts = placedParts(uz, lessons.slice(0, at).map((n) => n.node.id));
  const kinds: Record<string, number> = {};
  for (const p of parts) kinds[p.slice(0, p.indexOf(":"))] = (kinds[p.slice(0, p.indexOf(":"))] ?? 0) + 1;
  console.log(kinds, parts.filter((p) => !p.startsWith("lexeme:")));
});
