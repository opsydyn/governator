import type { Meta, StoryObj } from "@storybook/react-vite";
import { LegacyAlert } from "@example/ui";
const meta = {
  title: "Components/LegacyAlert",
  component: LegacyAlert,
  parameters: { governance: { componentId: "ui.legacy-alert" } },
  args: { message: "LegacyAlert is deprecated. Use Alert for new work." },
  tags: ["deprecated"],
} satisfies Meta<typeof LegacyAlert>;
export default meta;
export const Deprecated: StoryObj<typeof meta> = {};
