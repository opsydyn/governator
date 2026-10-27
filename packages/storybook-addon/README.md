# Governanator Governance addon

Read-only Storybook manager panel. Local preview package; private and unpublished.

## Addon-only quick start

Use an existing Storybook React/Vite project. The development reference is Storybook 10.6.4; the declared peer is `^10.6.4`. Other renderers and other 10.x versions have not been qualified. Independent npm and strict-peer pnpm consumers installed and built a local packed addon using reconstructed cache archives with lifecycle scripts disabled. This local evidence does not establish registry availability or original package integrity.

Packages remain private at `0.1.0`; registry installation is unavailable. Given an actual locally packed addon tarball, install it in your consumer project (replace the illustrative path):

```sh
npm install --save-dev /absolute/path/to/governanator-storybook-addon-0.1.0.tgz
# Or: pnpm add --save-dev /absolute/path/to/governanator-storybook-addon-0.1.0.tgz
```

These commands still require an available source for your project's Storybook dependencies. Local-cache or reconstructed-source qualification does not establish registry availability.

Add the package to your existing `.storybook/main.ts` configuration:

```ts
addons: ["@governanator/storybook-addon"];
```

In a story's default export, map its component and optionally supply a same-origin report served by your Storybook static directory:

```ts
parameters: {
  governance: {
    componentId: "ui.button",
    reportUrl: "/governance.json",
  },
},
```

Omit `reportUrl` for the no-report onboarding panel. To supply a report, generate it with the `@governanator/cli` package using `bun ./node_modules/.bin/governanator check --mapping governance/tests.json --format json --report-schema 2 > artifacts/governance.json` in a configured clean consumer Git project (see that package's README for prerequisites), copy the resulting JSON into your configured Storybook static directory as `governance.json`, and rebuild static Storybook after updating it. The addon does not run the CLI or generate evidence.

Set `parameters.governance.componentId` on each component's stories. Optionally set `parameters.governance.reportUrl` to a same-origin JSON report path. Without a report the panel shows onboarding; Storybook still works. Reports older than 24 hours, malformed reports, unsupported schemas and unknown IDs never show a ready gate. Fetch uses no credentials and rejects redirects.

The panel displays the snapshot's readiness and optional API compatibility independently. It performs no policy evaluation and grants no approval. Provenance and publication/deployment/adoption remain visible. Only configure reports produced by an engine you trust; schema validation does not authenticate a JSON file.

The browser bundle has no runtime dependency on the CLI, engine, Effect, Node or MCP. Storybook is the sole peer. The manager build supplies React. Bundle budget: 128 KiB raw / 16 KiB gzip.

The addon accepts strict schema 1 and schema 2 reports. Schema 2 shows each selected evidence ID with its reported producer and provenance, canonical UTC observation time, age in seconds at report evaluation, and optional source. Schema 1 details and missing sources are explicitly unknown. Reported metadata does not authenticate producers, and age at evaluation is not a live freshness guarantee. Existing report expiry and reload behavior applies to both versions.

Source references are displayed as text except absolute HTTP(S) URLs without credentials, which are keyboard-accessible links. Relative artifact paths and unsafe schemes remain escaped text. The addon does not fetch evidence sources. Older schema-1-only readers reject schema 2; generate schema 1 for those consumers (the CLI defaults to schema 1; use `--report-schema 2` to opt in).
