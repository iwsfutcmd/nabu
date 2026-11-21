import { cardKey, emptyLearnerState, languageSkills, partsOf, skillsAsked, type LearnedWord, type LearnerState, type RuleEntry } from "@nabu/core/learner";
import { glossOfPart, lexemesOfUnit, type CourseView } from "@nabu/core/lesson";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, type JSX } from "react";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { BUNDLES } from "../demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "../player/load.ts";
import { WordList } from "./WordList.tsx";

/** Toolbar target → fixture course and orthography (the compiled bundles in apps/web/public/bundles). */
const COURSES: Readonly<Record<NabuGlobals["target"], readonly [string, string]>> = {
  fa: ["fa", "fa-Arab/standard"],
  "yue-Hant-HK": ["yue", "yue-Hant-HK/standard"],
  "uz-Latn": ["uz", "uz-Latn/standard"],
  "apc-Arab": ["apc", "apc-Arab/standard"],
};

/**
 * The first unit's words, met: a strong one, a fading one and a due one in turn; every third known
 * (ADR 0100), the others still to show one or two of the skills the course asks of them.
 */
const sampleWords = (course: CourseView): LearnedWord[] => {
  const unit = course.units[0];
  if (unit === undefined) return [];
  const asked = skillsAsked(course);
  return lexemesOfUnit(course, unit).flatMap((lexeme, i): LearnedWord[] => {
    const form = lexeme.forms?.[course.orthography]?.[0];
    if (form === undefined) return [];
    const band = i % 3;
    const skills = asked(lexeme.id).map((skill, k) => ({ skill, shown: band === 0 || k < band }));
    return [
      {
        lexeme: lexeme.id,
        unit: unit.id,
        form,
        gloss: lexeme.gloss?.[course.supportKey],
        strength: band === 0 ? 0.97 : band === 1 ? 0.62 : 0.4,
        due: band === 2,
        reviews: 3 + i,
        known: skills.length > 0 && skills.every((s) => s.shown),
        skills,
      },
    ];
  });
};

/**
 * A learner who has met everything the first two units introduce, and shown every other skill
 * asked of each of it (and every other spelling and reading part): what the core's readers
 * (`partsOf`, `ruleEntries`) make of it is what the stories show.
 */
const sampleState = (course: CourseView): LearnerState => {
  const met: Record<string, string> = {};
  const shown: Record<string, string> = {};
  const at = "2026-03-01";
  let k = 0;
  for (const unit of course.units.slice(0, 2)) {
    for (const node of unit.nodes) {
      for (const part of node.introduces) {
        met[part] = at;
        for (const skill of languageSkills(part)) if (k++ % 2 === 0) shown[cardKey(part, skill, course.orthography)] = at;
        for (const skill of ["write-script", "read-script"] as const) if (k++ % 2 === 0) shown[cardKey(part, skill, course.orthography)] = at;
      }
    }
  }
  return { ...emptyLearnerState(), met, shown };
};

/**
 * The rules and taught forms of the whole course, met, each with two skills asked and one, both or
 * neither shown in turn; labelled as core labels them (`glossOfPart`), an id where nothing names it.
 * (A course with neither, Uzbek, shows no section: nothing met, nothing listed.)
 */
const sampleRules = (course: CourseView): readonly RuleEntry[] =>
  course.units
    .flatMap((u) => u.nodes.flatMap((n) => n.introduces))
    .filter((part, i, all) => (part.startsWith("rule:") || part.startsWith("feature:")) && all.indexOf(part) === i)
    .slice(0, 4)
    .map((part, i): RuleEntry => {
      const kind = part.startsWith("rule:") ? "rule" : "feature";
      const skills = (kind === "rule" ? (["recognize", "produce"] as const) : (["read-off", "choose"] as const)).map((skill, k) => ({ skill, shown: k < i % 3 }));
      return { part: part, kind, label: glossOfPart(course, part), skills, shown: skills.filter((k) => k.shown).length };
    });

const Demo = ({ loaded, opened, rules }: { loaded: LoadedCourse; opened?: boolean; rules?: boolean }): JSX.Element => {
  const sampled = useMemo(() => sampleWords(loaded.course), [loaded]);
  const state = useMemo(() => sampleState(loaded.course), [loaded]);
  // With parts shown, each word's skills are the state's, so its entry and its parts agree.
  const words = useMemo(
    () =>
      opened !== true && rules !== true
        ? sampled
        : sampled.map((w) => {
            const skills = partsOf(loaded.course, state, w.lexeme).flatMap((p) => (p.kind === "skill" ? [{ skill: p.skill, shown: p.status === "shown" }] : []));
            return { ...w, skills, known: skills.length > 0 && skills.every((k) => k.shown) };
          }),
    [sampled, state, loaded, opened, rules],
  );
  if (opened !== true && rules !== true) return <WordList course={loaded.course} words={words} url={loaded.imageUrl} />;
  return (
    <WordList
      course={loaded.course}
      words={words}
      url={loaded.imageUrl}
      parts={(lexeme) => partsOf(loaded.course, state, lexeme)}
      rules={rules === true ? sampleRules(loaded.course) : []}
      opened={opened === true ? words.slice(0, 2).map((w) => w.lexeme) : []}
    />
  );
};

const meta = {
  title: "Words",
  loaders: [
    async ({ globals }) => {
      const [id, orthography] = COURSES[(globals as NabuGlobals).target];
      return { course: await fetchCourse(BUNDLES, id, orthography) };
    },
  ],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The words of the first unit, learned: remembered well, fading, and due for review. */
export const WordListStory: Story = {
  name: "Word list",
  render: (_args, { loaded }) => <Demo loaded={loaded["course"] as LoadedCourse} />,
};

/** A word's entry opened to its parts (ADR 0146): each skill, form, spelling or reading asked of it, shown or not yet. */
export const OpenedEntry: Story = {
  name: "Opened entry",
  render: (_args, { loaded }) => <Demo loaded={loaded["course"] as LoadedCourse} opened />,
};

/** After the words, the rules and forms the learner has met, each with how many of its skills are shown. */
export const RulesAndForms: Story = {
  name: "Rules and forms",
  render: (_args, { loaded }) => <Demo loaded={loaded["course"] as LoadedCourse} rules />,
};
