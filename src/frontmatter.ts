/**
 * Minimal YAML-subset front matter parser. Fragments only ever need flat
 * scalars, inline arrays and block lists, so rulecast parses exactly that
 * instead of pulling in a YAML dependency: `key: value`, single/double
 * quoted strings, numbers, booleans, `[a, b]` and indented `- item` lists,
 * plus `#` comment lines. Nested maps are rejected with a precise error.
 */

/** Result of successfully splitting a fragment into data + body. */
export interface FrontmatterResult {
  /** Parsed key/value pairs. Values are string | number | boolean | array. */
  data: Record<string, unknown>;
  /** 1-based line number of each key, for anchoring lint diagnostics. */
  keyLines: Record<string, number>;
  /** Everything after the closing delimiter, untouched. */
  body: string;
  /** 1-based line number where the body starts in the original source. */
  bodyLine: number;
}

/** A parse failure with the line it happened on (1-based). */
export interface FrontmatterError {
  line: number;
  message: string;
}

export type FrontmatterParse =
  | { ok: true; value: FrontmatterResult }
  | { ok: false; error: FrontmatterError };

const DELIMITER = "---";

/**
 * Parse front matter from a fragment source. A file that does not open
 * with `---` on line 1 is treated as all-body with no data, so plain
 * Markdown fragments still load (and lint will then ask for a title).
 */
export function parseFrontmatter(source: string): FrontmatterParse {
  const lines = source.split("\n");
  if (lines.length === 0 || (lines[0] ?? "").trimEnd() !== DELIMITER) {
    return { ok: true, value: { data: {}, keyLines: {}, body: source, bodyLine: 1 } };
  }

  let closing = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? "").trimEnd() === DELIMITER) {
      closing = i;
      break;
    }
  }
  if (closing === -1) {
    return { ok: false, error: { line: 1, message: "front matter opened with --- but never closed" } };
  }

  const data: Record<string, unknown> = {};
  const keyLines: Record<string, number> = {};
  let pendingListKey: string | null = null;

  for (let i = 1; i < closing; i++) {
    const raw = lines[i] ?? "";
    const lineNo = i + 1;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const isIndented = /^\s/.test(raw);
    if (isIndented && trimmed.startsWith("- ")) {
      if (pendingListKey === null) {
        return { ok: false, error: { line: lineNo, message: "list item without a preceding `key:` line" } };
      }
      const scalar = parseScalar(trimmed.slice(2).trim(), lineNo);
      if (!scalar.ok) return scalar;
      (data[pendingListKey] as unknown[]).push(scalar.value);
      continue;
    }

    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:(.*)$/.exec(trimmed);
    if (!match || isIndented) {
      return {
        ok: false,
        error: { line: lineNo, message: `expected \`key: value\`, got ${JSON.stringify(trimmed)}` },
      };
    }
    const key = match[1] ?? "";
    const rest = (match[2] ?? "").trim();
    if (key in data) {
      return { ok: false, error: { line: lineNo, message: `duplicate key \`${key}\`` } };
    }
    keyLines[key] = lineNo;

    if (rest === "") {
      // A bare `key:` opens a block list; anything other than `- item`
      // lines after it (e.g. a nested map) is rejected above.
      data[key] = [];
      pendingListKey = key;
      continue;
    }
    pendingListKey = null;

    if (rest.startsWith("[")) {
      const arr = parseInlineArray(rest, lineNo);
      if (!arr.ok) return arr;
      data[key] = arr.value;
      continue;
    }

    const scalar = parseScalar(rest, lineNo);
    if (!scalar.ok) return scalar;
    data[key] = scalar.value;
  }

  return {
    ok: true,
    value: {
      data,
      keyLines,
      body: lines.slice(closing + 1).join("\n"),
      bodyLine: closing + 2,
    },
  };
}

type ScalarParse = { ok: true; value: string | number | boolean } | { ok: false; error: FrontmatterError };

function parseScalar(text: string, line: number): ScalarParse {
  if (text.length >= 2 && (text.startsWith('"') || text.startsWith("'"))) {
    const quote = text[0];
    if (!text.endsWith(quote as string)) {
      return { ok: false, error: { line, message: `unterminated ${quote} quote` } };
    }
    return { ok: true, value: text.slice(1, -1) };
  }
  if (text === "true") return { ok: true, value: true };
  if (text === "false") return { ok: true, value: false };
  if (/^-?\d+(\.\d+)?$/.test(text)) return { ok: true, value: Number(text) };
  // Bare scalars keep inline `#` content: globs like `packages/#legacy`
  // are implausible, but silently truncating values would be worse.
  return { ok: true, value: text };
}

type ArrayParse = { ok: true; value: Array<string | number | boolean> } | { ok: false; error: FrontmatterError };

function parseInlineArray(text: string, line: number): ArrayParse {
  if (!text.endsWith("]")) {
    return { ok: false, error: { line, message: "inline array opened with [ but never closed" } };
  }
  const inner = text.slice(1, -1).trim();
  if (inner === "") return { ok: true, value: [] };

  const items: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of inner) {
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ",") {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (quote !== null) {
    return { ok: false, error: { line, message: `unterminated ${quote} quote in inline array` } };
  }
  items.push(current.trim());

  const parsed: Array<string | number | boolean> = [];
  for (const item of items) {
    if (item === "") {
      return { ok: false, error: { line, message: "empty item in inline array" } };
    }
    const scalar = parseScalar(item, line);
    if (!scalar.ok) return scalar;
    parsed.push(scalar.value);
  }
  return { ok: true, value: parsed };
}
