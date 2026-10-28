import { Ajv2020 } from "ajv/dist/2020.js";
import { expect, test } from "vitest";
import schema from "../packages/protocol/governance-report-versioned.schema.json";
import { deduplicateSchemas } from "../scripts/schema-deduplicate.ts";
import { evaluate } from "../packages/core/src/index.ts";
import { at, evaluation } from "./fixtures.ts";

test("shared validator schemas preserve acceptance for valid and mutated reports", () => {
  const original = new Ajv2020({ strict: false }).compile(schema);
  const shared = new Ajv2020({ strict: false, inlineRefs: false }).compile(
    deduplicateSchemas(schema),
  );
  const release = {
    gate: "blocked",
    status: "not_eligible",
    assurance: "unverified",
    baselineVersion: "8.4.1",
    candidateVersion: "8.4.2",
    baselineDigest: "sha256:baseline",
    candidateDigest: "sha256:candidate",
    sourceCommit: "a".repeat(40),
    evaluatedAt: at,
    inputDigest: "sha256:inputs",
    minimumBump: "major",
    declaredBump: "patch",
    candidateManifest: "artifacts/candidate.json",
    affectedComponents: ["ui.button"],
    reasons: ["Breaking change"],
    remediation: ["Review"],
    publishable: false,
  };
  const validReports = [
    evaluate(evaluation()),
    evaluate(evaluation(), 2),
    { ...evaluate(evaluation(), 2), release },
  ];
  const samples: unknown[] = [null, {}, [], { schemaVersion: 3 }];
  const walk = (base: unknown, value: unknown, path: (string | number)[] = []) => {
    if (!value || typeof value !== "object") return;
    for (const key of Object.keys(value)) {
      const next = [...path, Array.isArray(value) ? Number(key) : key];
      for (const replacement of [undefined, null, 42, "invalid"]) {
        const copy = structuredClone(base) as Record<string, unknown>;
        let parent: any = copy;
        for (const part of next.slice(0, -1)) parent = parent[part];
        if (replacement === undefined) delete parent[next.at(-1)!];
        else parent[next.at(-1)!] = replacement;
        samples.push(copy);
      }
      walk(base, (value as Record<string, unknown>)[key], next);
    }
  };
  for (const valid of validReports) {
    expect(original(valid)).toBe(true);
    samples.push(valid);
    walk(valid, valid);
  }
  for (const sample of samples) expect(shared(sample)).toBe(original(sample));
});
