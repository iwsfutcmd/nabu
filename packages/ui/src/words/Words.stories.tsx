import { skillsAsked, type LearnedWord } from "@nabu/core/learner";
import type { CourseView } from "@nabu/core/lesson";
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
  return unit.kcs.flatMap((kc, i): LearnedWord[] => {
    const form = kc.forms?.[course.orthography]?.[0];
    if ((kc.kind !== "sense" && kc.kind !== "form") || form === undefined) return [];
    const band = i % 3;
    const skills = asked(kc.id).map((skill, k) => ({ skill, shown: band === 0 || k < band }));
    return [
      {
        kc: kc.id,
        unit: unit.id,
        form,
        gloss: kc.gloss?.[course.supportKey],
        strength: band === 0 ? 0.97 : band === 1 ? 0.62 : 0.4,
        due: band === 2,
        reviews: 3 + i,
        known: skills.length > 0 && skills.every((s) => s.shown),
        skills,
      },
    ];
  });
};

const Demo = ({ loaded }: { loaded: LoadedCourse }): JSX.Element => {
  const words = useMemo(() => sampleWords(loaded.course), [loaded]);
  return <WordList course={loaded.course} words={words} url={loaded.imageUrl} />;
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
