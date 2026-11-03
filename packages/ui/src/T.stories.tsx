import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SchemeId, TaggedText } from "@nabu/schema";
import type { NabuGlobals } from "../.storybook/toolbar.ts";
import { demoExercise } from "./demo/fixtures.ts";
import { T } from "./T.tsx";
import styles from "./T.stories.module.css";

const meta = {
  title: "Text/T",
  component: T,
  args: { text: demoExercise("fa").answer },
} satisfies Meta<typeof T>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The target answer sentence for the toolbar's target, with any ruby layer shown. */
export const TargetSentence: Story = {
  render: (_args, { globals }) => {
    const g = globals as NabuGlobals;
    return (
      <div className={styles.frame} data-writing-mode={g.writingMode}>
        <T as="p" text={demoExercise(g.target).answer} ruby={"jyutping" as SchemeId} />
      </div>
    );
  },
};

const time = {
  lang: "yue-Hant-HK",
  orthography: "yue-Hant-HK/standard",
  tokens: [
    { surface: "12", kind: "number" },
    { surface: "點", kind: "word" },
    { surface: "半", kind: "word" },
    { surface: "，", kind: "punct" },
    { surface: "2026", kind: "number" },
    { surface: "年", kind: "word" },
  ],
} as unknown as TaggedText;

/** Short numerals combine upright in vertical text (tate-chū-yoko); long ones stay sideways. */
export const TateChuYoko: Story = {
  render: () => (
    <div className={styles.frame} data-writing-mode="vertical-rl">
      <T as="p" text={time} />
    </div>
  ),
};
