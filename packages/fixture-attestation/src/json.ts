/** Parse a bounded UTF-8 JSON document without losing duplicate keys or integer precision. */
export function parseStrictJson(bytes: Uint8Array, maxBytes: number): unknown {
  if (
    !(bytes instanceof Uint8Array) ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 0 ||
    bytes.byteLength > maxBytes
  )
    throw new SyntaxError("invalid JSON bytes");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
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
