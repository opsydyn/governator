import { describe, expect, test } from "vitest";
import { snapshotApi, diffApi } from "../packages/versioning/src/api.ts";
import { digest } from "../packages/core/src/digest.ts";

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
const before = `export interface ButtonProps { label: string; tone?: 'primary' | 'quiet'; disabled?: boolean }\nexport declare function Button(props: ButtonProps): string;`;
function snapshot(declaration: string) {
  return snapshotApi(declaration, config);
}
function diff(declaration: string) {
  const baseline = snapshot(before);
  return diffApi(baseline, snapshot(declaration), digest(baseline));
}
describe("real declaration compatibility analysis", () => {
  test("rejects global and module augmentations which would merge comparison worlds", () => {
    expect(() =>
      snapshot(
        "declare global { interface SharedProps {label:string} } export type ButtonProps=SharedProps; export declare function Button(props:ButtonProps):string;",
      ),
    ).toThrow(/augmentation/i);
    expect(() =>
      snapshot(
        'declare module "other" { export interface Props { label:string } } export type ButtonProps={}; export declare function Button(props:ButtonProps):string;',
      ),
    ).toThrow(/augmentation/i);
  });
  test("widened structural props need a minor bump and hidden callable parameters need review", () => {
    const a = snapshot(
      "export type ButtonProps={[key:string]:string}; export declare function Button(props:ButtonProps):string;",
    );
    const b = snapshot(
      "export type ButtonProps={[key:string]:string|number}; export declare function Button(props:ButtonProps):string;",
    );
    expect(diffApi(a, b, digest(a)).minimumBump).toBe("minor");
    const old = snapshot(
      "export type ButtonProps={}; type InternalProps={value:string|number}; export declare function Button(props:InternalProps):string;",
    );
    const next = snapshot(
      "export type ButtonProps={}; type InternalProps={value:string}; export declare function Button(props:InternalProps):string;",
    );
    expect(diffApi(old, next, digest(old)).requiresReview).toBe(true);
  });
  test.each([
    [
      "index signature",
      `export type ButtonProps = {[key:string]:string|number}`,
      `export type ButtonProps = {[key:string]:string}`,
      "major",
    ],
    [
      "correlated union",
      `export type ButtonProps = {kind:'a';value:string|number}|{kind:'b';value:string|number}`,
      `export type ButtonProps = {kind:'a';value:string}|{kind:'b';value:number}`,
      "major",
    ],
    [
      "return alias",
      `type Result={value:string}; export type ButtonProps={}`,
      `type Result={value:number}; export type ButtonProps={}`,
      "unknown",
    ],
  ])("checks full structural types: %s", (_name, a, b, bump) => {
    const returns = _name === "return alias" ? "Result" : "string";
    const signature = `; export declare function Button(props:ButtonProps):${returns};`;
    const baseline = snapshot(a + signature);
    const candidate = snapshot(b + signature);
    expect(diffApi(baseline, candidate, digest(baseline)).minimumBump).toBe(bump);
  });
  test("extracts real public exports and required/optional props deterministically", () => {
    expect(snapshot(before)).toEqual(snapshot(before));
    expect(snapshot(before).components[0]).toMatchObject({
      componentId: "ui.button",
      props: { label: { optional: false, type: "string" }, tone: { optional: true } },
    });
  });
  test.each([
    ["removed prop", before.replace("tone?: 'primary' | 'quiet'; ", ""), "major"],
    ["required prop", before.replace("disabled?: boolean", "disabled: boolean"), "major"],
    ["narrowed union", before.replace("'primary' | 'quiet'", "'primary'"), "major"],
    [
      "new optional prop",
      before.replace("disabled?: boolean", "disabled?: boolean; loading?: boolean"),
      "minor",
    ],
    [
      "new required prop",
      before.replace("disabled?: boolean", "disabled?: boolean; loading: boolean"),
      "major",
    ],
    [
      "widened prop",
      before.replace("'primary' | 'quiet'", "'primary' | 'quiet' | 'danger'"),
      "minor",
    ],
  ])("%s requires %s", (_name, declaration, bump) => {
    expect(diff(declaration).minimumBump).toBe(bump);
  });
  test("removed exports block and unclassified non-prop changes remain unknown", () => {
    expect(
      diff(before.replace("export declare function Button", "declare function Button")).minimumBump,
    ).toBe("major");
    expect(diff(before.replace("): string", "): number")).minimumBump).toBe("unknown");
  });
  test("checks baseline digest and rejects unresolved or malformed declarations", () => {
    const baseline = snapshot(before);
    expect(() => diffApi(baseline, baseline, "sha256:wrong")).toThrow(/digest/i);
    expect(() => snapshot(before.replace("boolean", "UnresolvedType"))).toThrow(
      /TypeScript|declaration/i,
    );
    expect(() => snapshot("this is not valid TypeScript")).toThrow();
  });
  test("expands referenced types and detects callback narrowing with the checker", () => {
    const baseline = snapshot(
      `export type Tone = 'a' | 'b'; export interface ButtonProps { tone: Tone; onChange?: (value: string) => void } export declare function Button(props: ButtonProps): string;`,
    );
    const candidate = snapshot(
      `export type Tone = 'a'; export interface ButtonProps { tone: Tone; onChange?: (value: 'a') => void } export declare function Button(props: ButtonProps): string;`,
    );
    expect(diffApi(baseline, candidate, digest(baseline)).minimumBump).toBe("major");
  });
});
