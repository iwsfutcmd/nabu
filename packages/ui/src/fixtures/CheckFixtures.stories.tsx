/**
 * Deliberately broken fixtures that prove the visual checks can fail
 * (tests/visual/checks.spec.ts). Not components; never imported by the app.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { TaggedText } from "@nabu/schema";
import { T } from "../T.tsx";
import styles from "./CheckFixtures.module.css";

const meta = { title: "Fixtures/Visual checks" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Fully vocalized Arabic (marks above and below) in a box whose line height is far too small. */
const vocalized = {
  lang: "ar-Arab",
  orthography: "ar-Arab/standard",
  tokens: [{ surface: "\u0643\u0650\u062A\u064E\u0627\u0628\u064C", kind: "word" }],
} as unknown as TaggedText;

/** Ethiopic: no bundled font covers it, so Chromium must fall back to a system font or tofu. */
const ethiopic = {
  lang: "am-Ethi",
  orthography: "am-Ethi/standard",
  tokens: [{ surface: "\u1230\u120B\u121D", kind: "word" }],
} as unknown as TaggedText;

export const Clipped: Story = {
  render: () => (
    <div className={styles.page}>
      <div className={styles.cramped} data-ink-container="fixture-clipped">
        <T text={vocalized} />
      </div>
      <div className={styles.roomy} data-ink-container="fixture-ok">
        <T text={vocalized} />
      </div>
      <p data-fixture="uncovered-script">
        <T text={ethiopic} />
      </p>
    </div>
  ),
};
