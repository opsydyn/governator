import { createHash, createPublicKey, verify } from "node:crypto";

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const getTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
const getBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
const getOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")!.get!;
const getLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")!.get!;
const getArrayBufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)!.get!;

/** Copy the real typed-array slots without calling user accessors or iterators. */
export function copyBytes(value: unknown, maxBytes: number): Uint8Array {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || getTag.call(value) !== "Uint8Array")
    throw new Error("invalid bytes");
  const buffer = getBuffer.call(value) as ArrayBuffer;
  const offset = getOffset.call(value) as number;
  const length = getLength.call(value) as number;
  // This intrinsic rejects SharedArrayBuffer even from another realm.
  const backingLength = getArrayBufferLength.call(buffer) as number;
  if (length > maxBytes || offset + length > backingLength) throw new Error("invalid bytes");
  return new Uint8Array(buffer, offset, length).slice();
}

/** Reject duplicate decoded names, non-integral and unsafe numeric lexemes, and invalid UTF-8. */
export function parseStrictJson(bytes: Uint8Array, maxBytes: number): unknown {
  const copy = copyBytes(bytes, maxBytes);
  if (copy[0] === 0xef && copy[1] === 0xbb && copy[2] === 0xbf)
    throw new SyntaxError("invalid JSON");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(copy);
  let position = 0;
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const reject = (): never => {
    throw new SyntaxError("invalid JSON");
  };
  function whitespace(): void {
    while (/[\x20\t\r\n]/.test(text[position] ?? "x")) position++;
  }
  function string(): string {
    const start = position;
    if (text[position++] !== '"') reject();
    while (position < text.length) {
      const character = text[position++];
      if (character === '"') return JSON.parse(text.slice(start, position)) as string;
      if (character === "\\") position++;
    }
    return reject();
  }
  function value(depth: number): void {
    if (depth > 32) reject();
    whitespace();
    const character = text[position];
    if (character === '"') {
      string();
      return;
    }
    if (character === "{" || character === "[") {
      if (depth >= 32) reject();
      const object = character === "{";
      const end = object ? "}" : "]";
      const keys = new Set<string>();
      position++;
      whitespace();
      if (text[position] === end) {
        position++;
        return;
      }
      while (position < text.length) {
        if (object) {
          whitespace();
          const key = string();
          if (keys.has(key)) reject();
          keys.add(key);
          whitespace();
          if (text[position++] !== ":") reject();
        }
        value(depth + 1);
        whitespace();
        const separator = text[position++];
        if (separator === end) return;
        if (separator !== ",") reject();
      }
      reject();
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, position)) {
        position += literal.length;
        return;
      }
    }
    number.lastIndex = position;
    const token = number.exec(text)?.[0];
    if (token === undefined || !/^-?(?:0|[1-9]\d*)$/.test(token)) reject();
    if (!Number.isSafeInteger(Number(token))) reject();
    position += token!.length;
  }
  value(0);
  whitespace();
  if (position !== text.length) reject();
  return JSON.parse(text) as unknown;
}

/** Accept only padded standard RFC 4648 base64 and bound decoded length. */
export function decodeBase64(value: unknown, maxBytes: number): Buffer {
  if (
    typeof value !== "string" ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 0 ||
    value.length === 0 ||
    value.length > Math.ceil(maxBytes / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    throw new Error("invalid base64");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maxBytes || bytes.toString("base64") !== value)
    throw new Error("invalid base64");
  return bytes;
}

export function fingerprint(der: Uint8Array): string {
  return `sha256:${createHash("sha256").update(der).digest("hex")}`;
}

/** Validate Ed25519 SPKI serialization and its externally selected fingerprint. */
export function canonicalPublicKey(value: unknown, keyId: unknown): Buffer {
  const der = decodeBase64(value, 44);
  if (der.length !== 44 || fingerprint(der) !== keyId) throw new Error("invalid key");
  const key = createPublicKey({ key: der, type: "spki", format: "der" });
  if (
    key.asymmetricKeyType !== "ed25519" ||
    !key.export({ type: "spki", format: "der" }).equals(der)
  )
    throw new Error("invalid key");
  return der;
}

/** DSSE PAE, with lengths measured in bytes. */
export function pae(type: string, payload: Uint8Array): Uint8Array {
  const typeBytes = Buffer.from(type, "utf8");
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${typeBytes.length} `),
    typeBytes,
    Buffer.from(` ${payload.length} `),
    payload,
  ]);
}

export function verifyEd25519(
  der: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(der), type: "spki", format: "der" });
    return (
      key.asymmetricKeyType === "ed25519" &&
      signature.length === 64 &&
      verify(null, message, key, signature)
    );
  } catch {
    return false;
  }
}
