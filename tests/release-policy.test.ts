import { describe, expect, test } from "vitest";
import type { ReleaseArtifact } from "../packages/versioning/src/release-schema.ts";
import { parseIntent, assessRelease } from "../packages/versioning/src/release.ts";
import { snapshotApi } from "../packages/versioning/src/api.ts";
import { digest } from "../packages/core/src/digest.ts";
const commit = "a".repeat(40),
  at = "2026-10-27T08:00:00.000Z";
const config = {
  packageId: "@example/ui",
  packageVersion: "8.4.1",
  components: [
    {
      componentId: "ui.button",
      exportName: "Button",
      propsExport: "ButtonProps",
      contractVersion: "1.2.0",
    },
  ],
};
const declaration =
  "export interface ButtonProps { label:string; tone?:string } export declare function Button(props:ButtonProps):string;";
function artifact(
  version = "8.4.1",
  contract = "1.2.0",
  source = declaration,
  runtime = "old",
): ReleaseArtifact {
  return {
    schemaVersion: 1 as const,
    artifactDigest: digest(runtime + version),
    files: { "dist/index.js": digest(runtime), "dist/index.d.ts": digest(source) },
    manifest: {
      name: "@example/ui",
      version,
      type: "module",
      exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
      peerDependencies: { react: "^19" },
      dependencies: {},
    },
    api: snapshotApi(source, {
      ...config,
      packageVersion: version,
      components: [{ ...config.components[0]!, contractVersion: contract }],
    }),
  };
}
const baseline = artifact();
function context(
  candidate = artifact("9.0.0", "2.0.0", declaration.replace(" tone?:string", ""), "new"),
  mode: "local" | "demo" = "demo",
) {
  const classification = {
    schemaVersion: 1 as const,
    kind: "major" as const,
    reason: "Remove the obsolete tone API with a documented replacement.",
    issue: "local:button-api",
    impacts: ["types", "runtime"] as const,
    components: [
      {
        componentId: "ui.button",
        kind: "major" as const,
        reason: "Remove tone; migrate callers to the documented variant API.",
      },
    ],
    documents: {
      migrationGuide: "migration.md",
      manualMigrationPlan: "manual.md",
      consumerImpact: "consumers.md",
      compatibilityMatrix: "matrix.md",
    },
  };
  const inputDigest = digest(classification);
  const review = {
    schemaVersion: 1 as const,
    provenance: "simulated" as const,
    commit,
    artifactDigest: candidate.artifactDigest,
    inputDigest,
    reviewer: "fixture:design-system-owner",
    roles: ["design-system-owner", "api-owner"],
    observedAt: at,
    expiresAt: "2026-10-28T08:00:00.000Z",
    reason: "Reviewed this exact simulated candidate, migration and consumer matrix.",
  };
  return {
    baseline,
    candidate,
    consumerDiagnostics: [],
    intents: [
      {
        id: "button.md",
        contents:
          '---\n"@example/ui": major\n---\nRemove obsolete tone with documented migration guidance.',
      },
    ],
    classification,
    mode,
    commit,
    at,
    inputDigest,
    review,
    documents: {
      "migration.md": "Replace tone with variant in all Button call sites.",
      "manual.md": "Search call sites, update and rebuild each known consumer.",
      "consumers.md": "Usage is unknown outside the verified local consumer fixture.",
      "matrix.md": "Local TypeScript consumer migration fixture compiles successfully.",
    },
    localReport: {
      commit,
      evaluatedAt: at,
      decisions: [{ componentId: "ui.button", gate: "ready" }],
    },
  };
}
describe("Changesets and exact release policy", () => {
  test("special archive filenames still trigger distributed-change intent", () => {
    const old = {
      ...baseline,
      files: Object.fromEntries([...Object.entries(baseline.files), ["__proto__", digest("old")]]),
    };
    const candidate = {
      ...old,
      artifactDigest: digest("new archive"),
      files: Object.fromEntries([...Object.entries(baseline.files), ["__proto__", digest("new")]]),
    };
    const result = assessRelease({
      ...context(candidate),
      baseline: old,
      intents: [],
      classification: null,
      review: undefined,
    });
    expect(result.distributedChange).toBe(true);
    expect(result.changedFiles).toContain("__proto__");
    expect(result.gate).toBe("blocked");
  });
  test("unknown callable changes cannot erase known added-export minimums", () => {
    const old = artifact("1.0.0", "1.0.0", declaration, "old");
    const candidate = artifact(
      "1.0.1",
      "1.0.1",
      declaration.replace("):string", "):number") + " export declare const NEW_EXPORT:string;",
      "new",
    );
    const input = context(candidate);
    const classification = {
      ...input.classification,
      kind: "patch",
      components: input.classification.components.map((c) => ({ ...c, kind: "patch" })),
    };
    const result = assessRelease({
      ...input,
      baseline: old,
      classification,
      intents: [
        {
          id: "mixed.md",
          contents: '---\n"@example/ui": patch\n---\nMixed unknown and added public export.',
        },
      ],
    });
    expect(result.minimumBump).toBe("minor");
    expect(result.gate).toBe("blocked");
  });
  test("parses real Changesets and rejects empty summaries or malformed bumps", () => {
    expect(parseIntent('---\n"@example/ui": minor\n---\nAdd an optional prop.').releases).toEqual([
      { name: "@example/ui", type: "minor" },
    ]);
    expect(() => parseIntent('---\n"@example/ui": wat\n---\nBad bump')).toThrow();
    expect(() => parseIntent('---\n"@example/ui": patch\n---\n')).toThrow();
  });
  test("missing Changeset and breaking patch/minor fail regardless of a ready unit gate", () => {
    const input = context();
    expect(assessRelease({ ...input, intents: [] }).reasons.join(" ")).toMatch(/Changeset/i);
    for (const bump of ["patch", "minor"]) {
      const candidate = artifact(
        bump === "patch" ? "8.4.2" : "8.5.0",
        "1.2.1",
        declaration.replace(" tone?:string", ""),
        "new",
      );
      const result = assessRelease({
        ...context(candidate),
        intents: [
          {
            id: "button.md",
            contents: `---\n"@example/ui": ${bump}\n---\nBreaking Button migration.`,
          },
        ],
      });
      expect(result.gate).toBe("blocked");
      expect(result.reasons.join(" ")).toMatch(/major/i);
    }
  });
  test("requires exact version implied by highest applicable Changeset", () => {
    const input = context();
    const result = assessRelease({
      ...input,
      candidate: artifact("10.0.0", "2.0.0", declaration.replace(" tone?:string", ""), "new"),
    });
    expect(result.gate).toBe("blocked");
    expect(result.reasons.join(" ")).toMatch(/9.0.0/);
  });
  test("detects changed runtime bytes even when declarations stay identical", () => {
    const input = context(artifact("8.4.2", "1.2.0", declaration, "new"));
    const result = assessRelease({ ...input, intents: [], classification: null });
    expect(result.distributedChange).toBe(true);
    expect(result.gate).toBe("blocked");
  });
  test("unchanged distribution needs no Changeset or forced version bump", () => {
    const result = assessRelease({
      ...context(baseline, "local"),
      candidate: baseline,
      intents: [],
      classification: null,
      review: undefined,
    });
    expect(result.gate).toBe("ready");
    expect(result.distributedChange).toBe(false);
    expect(result.publishable).toBe(false);
  });
  test("simulated reviewed major passes only with exact source/artifact/input scope and migration proof", () => {
    const input = context();
    expect(assessRelease(input)).toMatchObject({
      gate: "ready",
      status: "eligible_under_demo_policy",
      assurance: "simulated",
      publishable: false,
      publication: "unknown",
      deployment: "unknown",
    });
    for (const delta of [
      { review: undefined },
      { documents: {} },
      { review: { ...input.review, artifactDigest: digest("wrong") } },
      { review: { ...input.review, commit: "b".repeat(40) } },
      { review: { ...input.review, inputDigest: digest("wrong") } },
      { review: { ...input.review, expiresAt: "2026-10-26T08:00:00.000Z" } },
      { localReport: { ...input.localReport, commit: "b".repeat(40) } },
      {
        localReport: {
          ...input.localReport,
          decisions: [{ componentId: "ui.button", gate: "blocked" }],
        },
      },
    ])
      expect(assessRelease({ ...input, ...delta }).gate).not.toBe("ready");
  });
  test("does not accept an underclassified detected break even with a major Changeset and simulated review", () => {
    const input = context();
    const classification = {
      ...input.classification,
      kind: "patch",
      components: input.classification.components.map((c) => ({ ...c, kind: "patch" })),
    };
    expect(assessRelease({ ...input, classification }).gate).toBe("blocked");
  });
  test("ordinary mode rejects self asserted or simulated reviews", () => {
    const result = assessRelease(context(undefined, "local"));
    expect(result.gate).not.toBe("ready");
    expect(result.reasons.join(" ")).toMatch(/trusted.*review|review.*unavailable/i);
  });
  test.each(["0.9.0", "9.0.0-rc.1"])("does not count %s as a stable release", (version) => {
    expect(
      assessRelease(
        context(artifact(version, "2.0.0", declaration.replace(" tone?:string", ""), "new")),
      ).gate,
    ).toBe("blocked");
  });
});
