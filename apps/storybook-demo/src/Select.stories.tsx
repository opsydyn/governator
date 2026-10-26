import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select } from "@example/ui";
const meta = {
  title: "Components/Select",
  component: Select,
  parameters: { governance: { componentId: "ui.select" } },
  args: {
    label: "Environment",
    options: [
      { value: "preview", label: "Preview" },
      { value: "production", label: "Production" },
    ],
  },
  tags: ["candidate"],
} satisfies Meta<typeof Select>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
