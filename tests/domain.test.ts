import { describe, expect, test } from "vitest";
import {
  decodeRegistry,
  decodePolicy,
  decodeEvidence,
  decodeContract,
} from "../packages/core/src/domain.ts";
import { component, registry, policy, evidence, contract } from "./fixtures.ts";

describe("versioned domain boundaries", () => {
  test("decodes component contract and package versions independently", () => {
    expect(decodeContract(contract)).toMatchObject({
      contractVersion: "1.0.0",
      packageVersion: "8.4.1",
    });
    expect(decodeRegistry(registry).components[0]?.id).toBe("ui.button");
  });
  test("rejects unsupported schema and malformed IDs", () => {
    expect(() => decodeRegistry({ ...registry, schemaVersion: 2 })).toThrow();
    expect(() => decodeRegistry({ ...registry, components: [{ ...component, id: "" }] })).toThrow();
  });
  test("rejects duplicate IDs, unknown replacements and replacement cycles", () => {
    expect(() => decodeRegistry({ ...registry, components: [component, component] })).toThrow(
      /duplicate/i,
    );
    expect(() =>
      decodeRegistry({ ...registry, components: [{ ...component, replacementId: "ui.nope" }] }),
    ).toThrow(/replacement/i);
    expect(() =>
      decodeRegistry({ ...registry, components: [{ ...component, replacementId: "ui.button" }] }),
    ).toThrow(/cycle/i);
  });
  test("rejects escaping source paths and duplicate story identities", () => {
    expect(() =>
      decodeRegistry({ ...registry, components: [{ ...component, source: "../secret" }] }),
    ).toThrow();
    expect(() =>
      decodeRegistry({ ...registry, components: [component, { ...component, id: "ui.other" }] }),
    ).toThrow(/story/i);
  });
  test("rejects unknown checks and invalid policy freshness", () => {
    expect(decodePolicy(policy).policyVersion).toBe("local-demo-v1");
    expect(() =>
      decodePolicy({
        ...policy,
        requirements: { stable: { checks: [{ id: "magic", acceptedProducers: [] }] } },
      }),
    ).toThrow();
    expect(() =>
      decodePolicy({
        ...policy,
        requirements: {
          stable: { checks: [{ id: "unit-test", acceptedProducers: ["vitest"], maxAgeHours: -1 }] },
        },
      }),
    ).toThrow();
  });
  test("rejects invalid timestamps and unrecognised approval fields", () => {
    expect(() => decodeEvidence({ ...evidence, observedAt: "yesterday" })).toThrow();
    expect(() => decodeEvidence({ ...evidence, approved: true })).toThrow();
    expect(() => decodeContract({ ...contract, contractVersion: "banana" })).toThrow();
  });
  test("rejects infinite freshness windows and Windows absolute paths on any host", () => {
    expect(() =>
      decodePolicy({
        ...policy,
        requirements: {
          stable: {
            checks: [{ id: "unit-test", acceptedProducers: ["vitest"], maxAgeHours: Infinity }],
          },
        },
      }),
    ).toThrow();
    expect(() =>
      decodeRegistry({
        ...registry,
        components: [{ ...component, source: "C:/private/Button.ts" }],
      }),
    ).toThrow();
  });
});
