/**
 * Feedback that names what a miss is (ADR 0148): one line a label, the worst first, each with the
 * words it is about, in their own language. A typed answer to a sentence of the toolbar's course,
 * with some of its words traded for other words of the course: one label; several, one of them
 * with two pairs; and the same while the judge may still accept the answer (lexical and order wait).
 */
import type { AlignOp, MissLabel } from "@nabu/core";
import { lexemesOfUnit, profileOf, sampleExercise, type CourseView, type Exercise, type Outcome } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, type JSX } from "react";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { CourseUiProvider } from "../context.tsx";
import { BUNDLES } from "../demo/bundles.ts";
import { Feedback } from "./Feedback.tsx";
import { fetchCourse, type LoadedCourse } from "./load.ts";

const COURSES: Readonly<Record<NabuGlobals["target"], readonly [string, string]>> = {
  fa: ["fa", "fa-Arab/standard"],
  "yue-Hant-HK": ["yue", "yue-Hant-HK/standard"],
  "uz-Latn": ["uz", "uz-Latn/standard"],
  "apc-Arab": ["apc", "apc-Arab/standard"],
};

type Screen = "one" | "several" | "held";
const SEED = 7;

/**
 * A miss of the card's sentence: its first units traded for words of the course's first unit (the
 * first lexical, the second another form, both lines naming their words), and for several labels,
 * a third out of its place and a slip.
 */
const missOf = (course: CourseView, ex: Exercise, screen: Screen): Outcome | undefined => {
  if (ex.template !== "translate-type.l1-l2") return undefined;
  const units = profileOf(course, ex.orthography).units(surfaceOf(ex.canonical));
  const unit = course.units[0];
  const others = (unit === undefined ? [] : lexemesOfUnit(course, unit))
    .flatMap((l) => l.forms?.[ex.orthography]?.map(surfaceOf) ?? [])
    .filter((w) => !units.includes(w));
  const trade = (i: number, labels: readonly MissLabel[]): AlignOp | undefined => {
    const expected = units[i];
    const actual = others[i % Math.max(1, others.length)];
    return expected === undefined || actual === undefined ? undefined : { op: "substitute", expected, actual, labels };
  };
  const traded: ReadonlyMap<number, AlignOp | undefined> =
    screen === "one"
      ? new Map([[0, trade(0, ["lexical"])]])
      : new Map([
          [0, trade(0, ["lexical"])],
          [1, trade(1, ["lexical", "slip"])],
          [2, trade(2, ["grammatical"])],
        ]);
  const alignment = units.map((u, i): AlignOp => traded.get(i) ?? { op: "match", expected: u, actual: u, kind: "exact" });
  const labels: readonly MissLabel[] = screen === "one" ? ["lexical"] : ["lexical", "grammatical", "order", "slip"];
  return { verdict: "WRONG", notes: [], solution: ex.canonical, alignment, closestIsSolution: true, labels };
};

const Demo = ({ loaded, screen }: { loaded: LoadedCourse; screen: Screen }): JSX.Element | null => {
  const { course } = loaded;
  const ex = useMemo(() => sampleExercise(course, "translate-type.l1-l2", SEED), [course]);
  const outcome = useMemo(() => (ex === undefined ? undefined : missOf(course, ex, screen)), [course, ex, screen]);
  if (ex === undefined || outcome === undefined) return null;
  const typed = (outcome.alignment ?? []).map((op) => (op.op === "delete" ? "" : op.actual)).join(profileOf(course, ex.orthography).unitKind === "grapheme" ? "" : " ");
  return (
    <CourseUiProvider course={course}>
      <div data-feedback-story={screen}>
        <Feedback ex={ex} outcome={outcome} response={{ tag: "text", text: typed }} course={course} ruby={false} marks="show" held={screen === "held"} />
      </div>
    </CourseUiProvider>
  );
};

const meta = {
  title: "Feedback",
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

/** One label: another word, the right one and the one typed named. */
export const OneLabel: Story = {
  name: "One label",
  render: (_args, { loaded }) => <Demo loaded={loaded["course"] as LoadedCourse} screen="one" />,
};

/** Several labels, the worst first: another word (two pairs in its line), another form, the order, a slip. */
export const SeveralLabels: Story = {
  name: "Several labels",
  render: (_args, { loaded }) => <Demo loaded={loaded["course"] as LoadedCourse} screen="several" />,
};

/** The same answer while the judge may still accept it: another word, another form and the order wait. */
export const HeldLabels: Story = {
  name: "Held labels",
  render: (_args, { loaded }) => <Demo loaded={loaded["course"] as LoadedCourse} screen="held" />,
};
