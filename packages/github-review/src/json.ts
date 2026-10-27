import { requireCondition, reviewLimits } from "./domain.ts";

/**
 * Scan bounded JSON before JSON.parse: reject duplicate decoded keys and validate original
 * numeric identity lexemes before IEEE-754 rounding. Strings are decoded only by JSON.parse.
 * All unneeded provider fields are accepted as data (subject to byte/depth limits).
 */
export function parseReviewJson(text: string): unknown {
  let position = 0;
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  function whitespace() {
    while (/[\x20\t\r\n]/.test(text[position] ?? "x")) position++;
  }
  function string(): string {
    const start = position;
    requireCondition(text[position++] === '"', "malformed_json");
    while (position < text.length) {
      const character = text[position++];
      if (character === '"') return JSON.parse(text.slice(start, position)) as string;
      if (character === "\\") position++;
    }
    throw new SyntaxError("malformed_json");
  }
  function value(path: readonly (string | number)[], depth: number): void {
    requireCondition(depth <= reviewLimits.jsonDepth, "malformed_json");
    whitespace();
    const character = text[position];
    if (character === '"') {
      string();
      return;
    }
    if (character === "{" || character === "[") {
      const object = character === "{";
      const end = object ? "}" : "]";
      const keys = new Set<string>();
      let index = 0;
      position++;
      whitespace();
      if (text[position] === end) {
        position++;
        return;
      }
      while (position < text.length) {
        let key: string | number = index++;
        if (object) {
          whitespace();
          key = string();
          requireCondition(!keys.has(key), "malformed_json");
          keys.add(key);
          whitespace();
          requireCondition(text[position++] === ":", "malformed_json");
        }
        value([...path, key], depth + 1);
        whitespace();
        const separator = text[position++];
        if (separator === end) return;
        requireCondition(separator === ",", "malformed_json");
      }
      throw new SyntaxError("malformed_json");
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, position)) {
        position += literal.length;
        return;
      }
    }
    number.lastIndex = position;
    const token = number.exec(text)?.[0];
    requireCondition(token !== undefined, "malformed_json");
    position += token.length;
    const identity =
      typeof path[0] === "number" &&
      ((path.length === 2 && path[1] === "id") ||
        (path.length === 3 && path[1] === "user" && path[2] === "id"));
    if (identity) {
      requireCondition(
        /^[1-9]\d*$/.test(token) &&
          token.length <= 16 &&
          BigInt(token) <= BigInt(Number.MAX_SAFE_INTEGER),
        "invalid_review",
      );
    }
  }
  value([], 0);
  whitespace();
  requireCondition(position === text.length, "malformed_json");
  return JSON.parse(text) as unknown;
}
