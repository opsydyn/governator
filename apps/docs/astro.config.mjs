import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Governanator",
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
