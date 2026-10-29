import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";
import { tagEditor } from "@opsydyn/storybook-addon-governator/tag-editor";
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@opsydyn/storybook-addon-governator"],
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
  viteFinal: async (config) => ({
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      tagEditor({
        registry: { root: resolve(process.cwd(), "../.."), path: "governance/components.yaml" },
      }),
    ],
  }),
};
export default config;
