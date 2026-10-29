# Governator Governance addon

Storybook governance panel and opt-in local metadata editor. Version `0.1.0` is published on npm. This source package identifies the local `0.2.0` candidate; it is not published merely because the manifest has that version.

## Addon-only quick start

Use an existing Storybook React/Vite project. The declared and qualified Storybook peer is exactly `10.6.4`. Other renderers and versions have not been qualified. Published 0.1.0 was installed and built in the repository demo. Earlier packed-consumer records describe their own historical qualification conditions.

Install the published addon in your consumer project:

```sh
npm install --save-dev @opsydyn/storybook-addon-governator@0.1.0
# Or: pnpm add --save-dev @opsydyn/storybook-addon-governator@0.1.0
```

Your project must also install the supported Storybook peer. To test the candidate, install one retained local `0.2.0` archive by exact file path and record its digest; do not substitute a workspace link or repacked archive.

Add the package to your existing `.storybook/main.ts` configuration:

```ts
addons: ["@opsydyn/storybook-addon-governator"];
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

Omit `reportUrl` for the no-report onboarding panel. To supply a report, generate it with the `@opsydyn/governator-cli` package using `bun ./node_modules/.bin/governator check --mapping governance/tests.json --format json --report-schema 2 > artifacts/governance.json` in a configured clean consumer Git project (see that package's README for prerequisites), copy the resulting JSON into your configured Storybook static directory as `governance.json`, and rebuild static Storybook after updating it. The addon does not run the CLI or generate evidence.

Set `parameters.governance.componentId` on each component's stories. Optionally set `parameters.governance.reportUrl` to a same-origin JSON report path. Without a report the panel shows onboarding; Storybook still works. Reports older than 24 hours, malformed reports, unsupported schemas and unknown IDs never show a ready gate. Fetch uses no credentials and rejects redirects.

## Edit declared governance metadata locally

The same opt-in development plugin can edit a component's record in the canonical registry. Configure the repository root explicitly, relative to the directory where Storybook starts, and set the global parameter only for Vite development builds:

```ts
// .storybook/main.ts: add the plugin to your existing viteFinal.
import { resolve } from "node:path";
import { tagEditor } from "@opsydyn/storybook-addon-governator/tag-editor";

tagEditor({
  registry: {
    root: resolve(process.cwd(), "../.."), // Change this for your Storybook's working directory.
    path: "governance/components.yaml", // Relative to the repository root.
  },
});
```

```ts
// .storybook/preview.ts: merge into your existing parameters.
export default {
  parameters: { governance: { registryEditor: import.meta.env.DEV } },
};
```

Select a mapped story and open **Edit story governance** in its Governance panel. The editor names the configured registry file and changes only the matching record. It validates individual fields before sending, and the server remains authoritative for the complete registry and paths. A revision conflict or uncertain response preserves the intended declaration: load current metadata, compare it, then explicitly reapply or discard the draft. Dirty metadata triggers the browser leave warning. In-session drafts do not survive a completed reload; independent writers do not share a lock. Review and commit the resulting registry diff normally.

After an edit, report-based status is unverified until the registry is committed and a report for that commit is regenerated and reloaded. With the editor enabled, the local adapter checks the report commit against Git HEAD and compares registry working-tree and index bytes to that commit; it rechecks on focus and periodically. A mismatch or unavailable check clears readiness filtering and current-status displays. This compares the registry only; it does not authenticate the report producer or prove that other report inputs are unchanged. Static and non-opted-in Storybooks show report snapshots without a live registry match. The writer is loopback-only, requires same-origin JSON writes and is not a hosted service.

## Edit descriptive tags locally

The optional editor is supported for local React/Vite Storybook 10.6.4. Enable the development-only Vite plugin in `.storybook/main.ts`:

```ts
import { tagEditor } from "@opsydyn/storybook-addon-governator/tag-editor";

// Add this property to the existing Storybook configuration.
viteFinal: async (config) => ({
  ...config,
  plugins: [...(config.plugins ?? []), tagEditor()],
}),
```

Open a story's Governance panel to add or remove descriptive tags and save them to the component metadata in that story file. Storybook reindexes the file and its existing sidebar tag filter can include or exclude the tags. Tags apply to stories in that file; other files for the same component are not changed. They do not modify lifecycle, readiness or release policy.

Unsaved edits are retained in memory when you switch stories or hide the addon panel and are restored when you return. Save or discard them before navigating from **Find components**. If the story file changes or a save outcome is unknown, load the current file and compare it with the preserved draft before reapplying. You can copy the intended tags for manual recovery. Dirty edits trigger the browser leave warning; drafts do not survive a completed page reload.

The editor only handles static CSF component metadata and literal string tag arrays. Built-in Storybook tags and negated tags are preserved and cannot be edited in the panel. Dynamic metadata, comments inside the tag array, linked files and stories outside the project are not editable. The editor checks the file revision and reports a conflict if it has changed; save again only after reloading. Edits through a single editor process are serialized, but other independent writers are not locked. Review the resulting file change in Git.

The writer only handles loopback requests; JSON writes require a same-origin request. Static Storybook builds and installations without this opt-in plugin remain read-only and display the story's indexed tags. This dev-only writer is not a hosted collaboration service. Do not expose a development server containing sensitive project data to an untrusted network.

The panel displays the snapshot's readiness and optional API compatibility independently. It performs no policy evaluation and grants no approval. Provenance and publication/deployment/adoption remain visible. Only configure reports produced by an engine you trust; schema validation does not authenticate a JSON file.

When a current report is available, open **Find components** in the Governance panel to filter its readiness decisions by blocked, insufficient evidence or ready, and search component IDs, packages or owners. The default view lists readiness decisions needing attention; release and API compatibility remain separate gates. The list shows up to 100 matches at a time; narrow the search to find others. Story links use literal `parameters.governance.componentId` declarations from local CSF story source, including literal story-level overrides. Unsupported dynamic or ambiguous declarations remain unlinked; report IDs and story titles are never guessed. Missing or stale reports do not show current discovery results.

The **G** toolbar control filters the Storybook sidebar by readiness from the currently selected story's report. Choose all, needs attention, blocked, missing evidence or ready; this combines with Storybook's native tag filters. Unmapped stories and ambiguous documentation entries remain visible, as can Storybook error entries. The control resets to all when the selected report changes or is observed missing, invalid or expired, or when its mapping is unavailable. When unavailable, the toolbar explains why and offers Retry to reload the mapping and report. If the story-map endpoint is missing, rebuild and restart Storybook before retrying. The toolbar also retries a failed report when the window regains focus. Composed Storybooks disable this control because local and remote story identities cannot yet be distinguished safely. This is navigation, not a release approval.

On supported React/Vite Storybook setups, the addon builds a separate source mapping without adding tags to Storybook's filter. It supports literal CSF component metadata, object stories and direct function stories. Custom indexers, composed Storybooks, dynamically constructed parameters, and files with assignments, updates or eager calls may remain unlinked. The mapping is navigation information, not governance evidence, and uses Storybook's experimental indexer and internal index generator APIs. Rebuild or restart Storybook after configuration changes; if the mapping is unavailable, stories stay unlinked.

The browser bundle has no runtime dependency on the CLI, engine, Effect, Node or MCP. Storybook is the sole peer. The manager build supplies React. Bundle budget: 128 KiB raw / 16 KiB gzip.

The addon accepts strict schema 1 and schema 2 reports. Schema 2 shows each selected evidence ID with its reported producer and provenance, canonical UTC observation time, age in seconds at report evaluation, and optional source. Schema 1 details and missing sources are explicitly unknown. Reported metadata does not authenticate producers, and age at evaluation is not a live freshness guarantee. Existing report expiry and reload behavior applies to both versions.

Source references are displayed as text except absolute HTTP(S) URLs without credentials, which are keyboard-accessible links. Relative artifact paths and unsafe schemes remain escaped text. The addon does not fetch evidence sources. Older schema-1-only readers reject schema 2; generate schema 1 for those consumers (the CLI defaults to schema 1; use `--report-schema 2` to opt in).

The development source adds an optional `./authoring` API-1 adapter for CLI tag inspection, plans and updates. It reuses the local editor parser and revision checks. This adapter is not included in published 0.1.0.
