export const commit = "a".repeat(40);
export const at = "2026-10-26T12:00:00.000Z";
export const component = {
  id: "ui.button",
  name: "Button",
  package: "@example/ui",
  owners: ["@design-system"],
  lifecycle: "candidate" as const,
  source: "fixtures/Button.ts",
  stories: ["fixtures/Button.stories.ts"],
  contractVersion: "1.0.0",
  exportPath: "@example/ui/button",
};
export const registry = { schemaVersion: 1 as const, components: [component] };
export const policy = {
  schemaVersion: 1 as const,
  policyVersion: "local-demo-v1",
  requirements: {
    stable: {
      checks: [{ id: "unit-test" as const, acceptedProducers: ["vitest"], maxAgeHours: 24 }],
    },
  },
  transitions: {
    draft: ["candidate"],
    candidate: ["stable"],
    stable: ["deprecated"],
    deprecated: ["retired"],
    retired: [],
  },
  waivers: { enabled: true, maxDurationDays: 14, disallowFor: ["ownership"] },
};
export const evidence = {
  schemaVersion: 1 as const,
  id: "test-button",
  componentId: "ui.button",
  check: "unit-test" as const,
  outcome: "passed" as const,
  producer: "vitest",
  repository: "demo",
  commit,
  observedAt: "2026-10-26T11:00:00.000Z",
  provenance: "demo" as const,
};
export const evaluation = () => ({
  registry: structuredClone(registry),
  policy: structuredClone(policy),
  evidence: [structuredClone(evidence)],
  waivers: [],
  target: "stable",
  at,
  commit,
  repository: "demo",
  mode: "demo",
  verifiedEvidenceDigests: {},
  verifiedWaiverDigests: {},
});
export const contract = {
  schemaVersion: 1,
  componentId: "ui.button",
  contractVersion: "1.0.0",
  package: "@example/ui",
  packageVersion: "8.4.1",
  exportPath: "@example/ui/button",
  lifecycle: "stable",
  publicProps: { disabled: { optional: true, type: "boolean" } },
  behaviorContracts: ["focus.visible"],
};
