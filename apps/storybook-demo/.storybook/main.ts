import type { StorybookConfig } from "@storybook/react-vite";
import { tagEditor } from "@governator/storybook-addon/tag-editor";
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@governator/storybook-addon"],
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
  viteFinal: async (config) => ({ ...config, plugins: [...(config.plugins ?? []), tagEditor()] }),
};
export default config;
