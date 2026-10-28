import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert } from "@example/ui";
const meta = {
  title: "Components/Alert",
  component: Alert,
  parameters: { governance: { componentId: "ui.alert" } },
  args: { message: "Your changes have been saved." },
  tags: ["stable", "new"],
} satisfies Meta<typeof Alert>;
export default meta;
export const Information: StoryObj<typeof meta> = {};
export const Warning: StoryObj<typeof meta> = {
  args: { message: "Review the proposed change before releasing.", tone: "warning" },
};
