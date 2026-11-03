import type { Meta, StoryObj } from "@storybook/react-vite";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { DemoExerciseCard } from "./DemoExerciseCard.tsx";

const meta = {
  title: "Demo/Exercise card",
  component: DemoExerciseCard,
  args: { target: "fa" },
} satisfies Meta<typeof DemoExerciseCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Target and writing mode come from the toolbar, like the visual matrix. */
export const FromToolbar: Story = {
  render: (_args, { globals }) => {
    const g = globals as NabuGlobals;
    return <DemoExerciseCard target={g.target} writingMode={g.writingMode} />;
  },
};
