import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// The build configuration selects the deployment base; application code has no ambient environment dependency.
// oxlint-disable-next-line linteffect/no-process-env-direct-read
const pages = process.env.GOVERNATOR_PAGES === "true";
const base = pages ? "/governator/" : "/";

export default defineConfig({
  ...(pages ? { site: "https://opsydyn.github.io", base } : {}),
  integrations: [
    starlight({
      title: "Governator",
      favicon: "/brand/icon-192.png",
      disable404Route: true,
      description: "Local governance tools for design-system maintainers.",
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        { label: "Tutorials", items: [{ autogenerate: { directory: "tutorials" } }] },
        { label: "How-to guides", items: [{ autogenerate: { directory: "how-to" } }] },
        { label: "Reference", items: [{ autogenerate: { directory: "reference" } }] },
        { label: "Explanation", items: [{ autogenerate: { directory: "explanation" } }] },
      ],
    }),
  ],
});
