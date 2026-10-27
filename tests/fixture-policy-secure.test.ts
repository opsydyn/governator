import { createPrivateKey, sign } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  canonicalPublicKey,
  copyBytes,
  decodeBase64,
  fingerprint,
  pae,
  parseStrictJson,
  verifyEd25519,
} from "../packages/fixture-policy/src/secure.ts";

describe("fixture policy cryptographic input boundary", () => {
  it("matches the RFC 8032 Ed25519 empty-message vector", () => {
    const key = Buffer.from(
      "302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
      "hex",
    );
    const signature = Buffer.from(
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
      "hex",
    );
    expect(verifyEd25519(key, new Uint8Array(), signature)).toBe(true);
    expect(verifyEd25519(key, Buffer.from("x"), signature)).toBe(false);
    expect(canonicalPublicKey(key.toString("base64"), fingerprint(key))).toEqual(key);
  });
  it("matches a manually constructed DSSE byte encoding with multibyte text", () => {
    expect(Buffer.from(pae("é", Buffer.from("abc"))).toString("hex")).toBe(
      "445353457631203220c3a9203320616263",
    );
  });
  it("rejects noncanonical base64 and a substituted key fingerprint", () => {
    expect(decodeBase64("AQ==", 1)).toEqual(Buffer.from([1]));
    for (const text of ["AQ", "AR==", "AQ--", "AQ==\n", ""])
      expect(() => decodeBase64(text, 64)).toThrow();
    expect(() =>
      canonicalPublicKey(Buffer.alloc(44).toString("base64"), `sha256:${"0".repeat(64)}`),
    ).toThrow();
  });
  it("copies actual byte slots without calling caller iteration or aliasing", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    Object.defineProperty(bytes, Symbol.iterator, {
      value() {
        throw Error("iterator called");
      },
    });
    const copy = copyBytes(bytes, 3);
    bytes[0] = 9;
    expect(Array.from(copy)).toEqual([1, 2, 3]);
    expect(() => copyBytes(bytes, 2)).toThrow();
    expect(() => copyBytes(new Uint16Array([1]), 4)).toThrow();
  });
  it("rejects shared backing even across realms and accepts ordinary cross-realm byte arrays", () => {
    const shared = runInNewContext("new Uint8Array(new SharedArrayBuffer(2))") as Uint8Array;
    const normal = runInNewContext("new Uint8Array([4,5])") as Uint8Array;
    expect(() => copyBytes(shared, 2)).toThrow();
    expect(Array.from(copyBytes(normal, 2))).toEqual([4, 5]);
  });
  it("rejects malformed signed payload bytes after valid signature verification", () => {
    const seed = Buffer.from(
      "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
      "hex",
    );
    const privateKey = createPrivateKey({
      key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
      type: "pkcs8",
      format: "der",
    });
    const publicKey = Buffer.from(
      "302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
      "hex",
    );
    const bad = [
      Buffer.from('{"x":1,"\\u0078":2}'),
      Buffer.from('{"x":9007199254740992}'),
      Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]),
    ];
    for (const payload of bad) {
      const message = pae("fixture", payload);
      expect(verifyEd25519(publicKey, message, sign(null, message, privateKey))).toBe(true);
      expect(() => parseStrictJson(payload, 65_536)).toThrow();
    }
    expect(parseStrictJson(Buffer.from('{"ok":1}'), 8)).toEqual({ ok: 1 });
  });
});
