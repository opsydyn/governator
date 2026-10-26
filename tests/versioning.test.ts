import { describe, expect, test } from "vitest";
import {
  assessVersion,
  verifyBaseline,
  requiredPackageBump,
} from "../packages/versioning/src/index.ts";
import { contract } from "./fixtures.ts";
import { digest } from "../packages/core/src/index.ts";
import { readFile } from "node:fs/promises";

describe("audited component version semantics", () => {
  test.each([
    ["1.0.0", "1.0.1", "patch", true],
    ["1.0.0", "1.1.0", "minor", true],
    ["1.0.0", "1.0.1", "major", false],
    ["1.0.0", "1.1.0", "major", false],
    ["1.0.0", "2.0.0", "major", false],
    ["1.0.0", "1.0.0", "patch", false],
    ["1.0.0", "0.9.0", "patch", false],
    ["1.0.0", "1.1.0-rc.1", "minor", false],
    ["0.1.0", "0.2.0", "minor", false],
    ["1.0.0-rc.1", "1.0.0", "patch", false],
    ["1.0.0", "1.0.0", "none", true],
  ] as const)("%s -> %s requires %s (eligible %s)", (previous, proposed, minimum, eligible) => {
    expect(
      assessVersion({
        previous,
        proposed,
        minimum,
        classified: true,
        majorRequirementsVerified: false,
      }).eligible,
    ).toBe(eligible);
  });
  test("a major bump still requires verified review and migration evidence", () => {
    expect(
      assessVersion({
        previous: "1.0.0",
        proposed: "2.0.0",
        minimum: "major",
        classified: true,
        majorRequirementsVerified: true,
      }).eligible,
    ).toBe(true);
    expect(
      assessVersion({
        previous: "1.0.0",
        proposed: "1.0.1",
        minimum: "unknown",
        classified: false,
        majorRequirementsVerified: true,
      }).eligible,
    ).toBe(false);
  });
  test("shared package requires highest component/export/token bump", () => {
    expect(requiredPackageBump(["patch", "major", "minor"])).toBe("major");
    expect(requiredPackageBump(["patch", "unknown"])).toBe("unknown");
    expect(requiredPackageBump([])).toBe("none");
  });
  test("baseline identity and digest must match; fixture does not prove publication", () => {
    const baseline = {
      schemaVersion: 1,
      package: "@example/ui",
      packageVersion: "8.4.1",
      origin: "local-fixture",
      contracts: [contract],
    };
    expect(verifyBaseline(baseline, digest(baseline), "@example/ui", "8.4.1")).toMatchObject({
      publication: "unknown",
    });
    expect(() =>
      verifyBaseline(
        { ...baseline, packageVersion: "8.4.2" },
        digest(baseline),
        "@example/ui",
        "8.4.1",
      ),
    ).toThrow();
    expect(() => verifyBaseline(baseline, digest(baseline), "@example/other", "8.4.1")).toThrow();
  });
  test("checked-in baseline remains addressable by exact package version and hash", async () => {
    const path = "governance/baselines/example-ui/8.4.1.json";
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    const expected = (await readFile(`${path}.sha256`, "utf8")).trim();
    expect(
      verifyBaseline(raw, expected, "@example/ui", "8.4.1").baseline.contracts[0]?.contractVersion,
    ).toBe("1.2.0");
  });
});
