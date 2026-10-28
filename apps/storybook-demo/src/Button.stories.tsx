import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@example/ui";
const meta = {
  title: "Components/Button",
  component: Button,
  parameters: { governance: { componentId: "ui.button" } },
  args: { label: "Save changes", variant: "primary" },
  tags: ["stable", "actions"],
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Primary: Story = {};
export const Quiet: Story = { args: { variant: "quiet", label: "Cancel" } };
export const Disabled: Story = { args: { disabled: true, label: "Saving unavailable" } };
