import type { Preview } from "@storybook/react-vite";
import "../src/preview.css";
const preview: Preview = {
  parameters: {
    layout: "centered",
    governance: { reportUrl: "./governance-report.json", registryEditor: import.meta.env.DEV },
    controls: { expanded: true },
    backgrounds: {
      options: {
        light: { name: "Light", value: "#f5f6f8" },
        dark: { name: "Dark", value: "#192332" },
      },
    },
    docs: { toc: true },
  },
  tags: ["autodocs"],
};
export default preview;
