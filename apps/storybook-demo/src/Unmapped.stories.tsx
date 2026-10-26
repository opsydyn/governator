import type { Meta, StoryObj } from "@storybook/react-vite";
const meta = {
  title: "Diagnostics/Unmapped",
  parameters: { governance: { componentId: "ui.unmapped" } },
  render: () => <p>This story has no registry mapping. Its governance must stay unverified.</p>,
} satisfies Meta;
export default meta;
export const Example: StoryObj<typeof meta> = {};
