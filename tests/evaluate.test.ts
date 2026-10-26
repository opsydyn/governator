import { describe, expect, test } from "vitest";
import { evaluate, digest, comparePolicy } from "../packages/core/src/index.ts";
import { at, commit, evaluation, evidence } from "./fixtures.ts";

const first = (input: unknown) =>
  evaluate(input).decisions.find((d) => d.componentId === "ui.button");
describe("readiness and trust", () => {
  test.each(["0.2.0", "1.0.0-rc.1"])(
    "contract %s cannot be ready for stable promotion",
    (contractVersion) => {
      const input = evaluation();
      expect(
        first({
          ...input,
          registry: {
            ...input.registry,
            components: input.registry.components.map((c) => ({ ...c, contractVersion })),
          },
        })?.gate,
      ).toBe("blocked");
    },
  );
  test("same inputs produce identical ordered reports with explicit demo assurance", () => {
    const input = evaluation();
    expect(evaluate(input)).toEqual(evaluate(input));
    expect(first(input)).toMatchObject({
      componentId: "ui.button",
      gate: "ready",
      lifecycle: "candidate",
    });
    expect(evaluate(input)).toMatchObject({
      assurance: "demo",
      evaluatedAt: at,
      commit,
      publication: "unknown",
      deployment: "unknown",
      adoption: "unknown",
    });
  });
  test("missing proof differs from a known failure and failure takes precedence", () => {
    expect(first({ ...evaluation(), evidence: [] })?.gate).toBe("insufficient_evidence");
    expect(first({ ...evaluation(), evidence: [{ ...evidence, outcome: "failed" }] })?.gate).toBe(
      "blocked",
    );
    const input = evaluation();
    input.policy.requirements.stable.checks.push({
      id: "unit-test",
      acceptedProducers: ["other"],
      maxAgeHours: 24,
    });
    expect(() => evaluate(input)).toThrow(/duplicate/i);
  });
  test("conflicting accepted fresh evidence cannot silently replace a failure with success", () => {
    expect(
      first({
        ...evaluation(),
        evidence: [evidence, { ...evidence, id: "failure", outcome: "failed" }],
      })?.gate,
    ).toBe("blocked");
  });
  test.each([
    ["old", { observedAt: "2026-10-24T11:00:00.000Z" }, "expired"],
    ["expiry boundary", { expiresAt: at }, "expired"],
    ["future", { observedAt: "2026-10-26T13:00:00.000Z" }, "missing"],
    ["wrong SHA", { commit: "b".repeat(40) }, "missing"],
    ["wrong repo", { repository: "other" }, "missing"],
    ["wrong component", { componentId: "ui.other" }, "missing"],
    ["unaccepted producer", { producer: "unknown" }, "missing"],
  ])("%s evidence does not pass", (_name, change, result) => {
    const decision = first({ ...evaluation(), evidence: [{ ...evidence, ...change }] });
    expect(decision?.gate).toBe("insufficient_evidence");
    expect(decision?.checks[0]?.result).toBe(result);
  });
  test("exact maximum age is valid but a millisecond older is expired", () => {
    expect(
      first({
        ...evaluation(),
        evidence: [{ ...evidence, observedAt: "2026-10-25T12:00:00.000Z" }],
      })?.gate,
    ).toBe("ready");
    expect(
      first({
        ...evaluation(),
        evidence: [{ ...evidence, observedAt: "2026-10-25T11:59:59.999Z" }],
      })?.gate,
    ).toBe("insufficient_evidence");
  });
  test("files cannot self-assert verified provenance and digest binds trusted evidence content", () => {
    const item = { ...evidence, provenance: "adapter" };
    const input = { ...evaluation(), mode: "verified", evidence: [item] };
    expect(first(input)?.gate).toBe("insufficient_evidence");
    expect(first({ ...input, verifiedEvidenceDigests: { [item.id]: digest(item) } })?.gate).toBe(
      "ready",
    );
    expect(
      first({
        ...input,
        evidence: [{ ...item, outcome: "failed" }],
        verifiedEvidenceDigests: { [item.id]: digest(item) },
      })?.gate,
    ).toBe("insufficient_evidence");
    expect(first({ ...evaluation(), mode: "verified" })?.gate).toBe("insufficient_evidence");
  });
  test("expired, excessive, unverified and prohibited waivers cannot satisfy a gate", () => {
    const waiver = {
      schemaVersion: 1,
      id: "w1",
      componentId: "ui.button",
      check: "unit-test",
      approver: "@owner",
      reason: "Demo exception",
      reference: "issue:1",
      issuedAt: "2026-10-26T10:00:00.000Z",
      expiresAt: "2026-10-27T10:00:00.000Z",
      provenance: "demo",
    };
    expect(first({ ...evaluation(), evidence: [], waivers: [waiver] })?.checks[0]?.result).toBe(
      "waived",
    );
    for (const change of [
      { expiresAt: at },
      { expiresAt: "2026-12-01T00:00:00.000Z" },
      { issuedAt: "2026-10-27T00:00:00.000Z" },
      { provenance: "unverified" },
    ]) {
      expect(
        first({ ...evaluation(), evidence: [], waivers: [{ ...waiver, ...change }] })?.gate,
      ).toBe("insufficient_evidence");
    }
    const input = evaluation();
    input.policy.waivers.disallowFor = ["unit-test"];
    expect(first({ ...input, evidence: [], waivers: [waiver] })?.gate).toBe(
      "insufficient_evidence",
    );
  });
  test("disallowed transitions and new adoption of deprecated components are blocked", () => {
    expect(first({ ...evaluation(), target: "retired" })?.gate).toBe("blocked");
    const input = evaluation();
    expect(
      first({
        ...input,
        registry: {
          ...input.registry,
          components: [
            { ...input.registry.components[0], lifecycle: "deprecated", replacementId: "ui.alert" },
            { ...input.registry.components[0], id: "ui.alert", stories: [], lifecycle: "stable" },
          ],
        },
        useCase: "new-adoption",
      })?.gate,
    ).toBe("blocked");
  });
  test("missing target policy fails closed, malformed time and duplicate evidence are errors", () => {
    expect(
      first({
        ...evaluation(),
        target: "candidate",
        policy: { ...evaluation().policy, requirements: {} },
      })?.gate,
    ).toBe("insufficient_evidence");
    expect(() => evaluate({ ...evaluation(), at: "invalid" })).toThrow();
    expect(() => evaluate({ ...evaluation(), evidence: [evidence, evidence] })).toThrow(
      /duplicate/i,
    );
  });
  test("policy weakening requires an independent owner attestation", () => {
    const original = evaluation().policy;
    const weaker = { ...original, requirements: { stable: { checks: [] } } };
    expect(comparePolicy(original, weaker, false).gate).toBe("blocked");
    expect(comparePolicy(original, weaker, true).gate).toBe("ready");
    expect(comparePolicy(original, original, false).gate).toBe("ready");
  });
  test("normal mode without verified evidence says unverified, never verified inputs", () => {
    expect(evaluate({ ...evaluation(), mode: "verified" }).assurance).toBe("unverified");
  });
  test("validated evidence and waiver order cannot change the report", () => {
    const items = [evidence, { ...evidence, id: "other-pass" }];
    expect(evaluate({ ...evaluation(), evidence: items })).toEqual(
      evaluate({ ...evaluation(), evidence: [...items].reverse() }),
    );
  });
});
