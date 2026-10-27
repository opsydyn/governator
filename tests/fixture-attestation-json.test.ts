import { describe, expect, test } from "vitest";
import { parseStrictJson } from "../packages/fixture-attestation/src/json.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("fixture attestation strict JSON", () => {
  test("parses a bounded valid document", () => {
    expect(parseStrictJson(bytes('{"id":9007199254740991,"names":["é",true,null]}'), 100)).toEqual({
      id: 9007199254740991,
      names: ["é", true, null],
    });
  });

  test.each([
    ["duplicate properties", '{"id":1,"id":2}'],
    ["duplicate escaped properties", '{"id":1,"\\u0069d":2}'],
    ["nested duplicates", '{"outer":{"x":1,"x":2}}'],
    ["rounded integer", '{"id":9007199254740992}'],
    ["fraction rounding to integer", '{"id":1.00000000000000001}'],
    ["exponent rounding to integer", '{"id":1e0}'],
    ["negative unsafe integer", '{"id":-9007199254740992}'],
    ["trailing comma", '{"id":1,}'],
    ["trailing content", "{} true"],
    ["invalid escape", '{"id":"\\q"}'],
    ["unclosed object", '{"id":1'],
  ])("rejects %s", (_label, text) => {
    expect(() => parseStrictJson(bytes(text), 1024)).toThrow();
  });

  test("rejects malformed UTF-8 rather than replacing bytes", () => {
    expect(() =>
      parseStrictJson(new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]), 20),
    ).toThrow();
  });

  test("rejects excess bytes and nesting", () => {
    expect(() => parseStrictJson(bytes("{}"), 1)).toThrow();
    expect(() => parseStrictJson(bytes(`${"[".repeat(33)}0${"]".repeat(33)}`), 100)).toThrow();
    expect(() => parseStrictJson(bytes(`${"[".repeat(33)}${"]".repeat(33)}`), 100)).toThrow();
  });
});
