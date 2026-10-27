import { expect, test } from "vitest";
import { checkConsumers } from "../packages/versioning/src/consumers.ts";
test("compiles real consumer imports against the exact packed API, rejecting removed props", () => {
  const declaration =
    "export interface ButtonProps {label:string;variant?:string} export declare function Button(props:ButtonProps):string;";
  expect(
    checkConsumers("@test/ui", declaration, [
      "import {Button} from '@test/ui'; Button({label:'ok',variant:'primary'});",
    ]),
  ).toEqual([]);
  expect(
    checkConsumers("@test/ui", declaration, [
      "import {Button} from '@test/ui'; Button({label:'old',tone:'primary'});",
    ]).join(" "),
  ).toMatch(/tone/);
});
