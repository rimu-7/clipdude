export function toUpperCase(text: string): string {
  return text.toUpperCase();
}

export function toLowerCase(text: string): string {
  return text.toLowerCase();
}

export function trimWhitespace(text: string): string {
  return text.trim().replace(/\n{3,}/g, "\n\n");
}

export function stripFormatting(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function prettifyJSON(text: string): string | null {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

export function minifyJSON(text: string): string | null {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

export function toTitleCase(text: string): string {
  return text.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
  );
}

export function toCamelCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
}

export function toSnakeCase(text: string): string {
  return text
    .replace(/\s+/g, "_")
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

export function toKebabCase(text: string): string {
  return text
    .replace(/\s+/g, "-")
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "");
}

export function removeDuplicateLines(text: string): string {
  const lines = text.split("\n");
  const seen = new Set<string>();
  return lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed === "") return true;
    if (seen.has(trimmed)) return false;
    seen.add(trimmed);
    return true;
  }).join("\n");
}

export function sortLines(text: string): string {
  return text.split("\n").sort().join("\n");
}

export function reverseLines(text: string): string {
  return text.split("\n").reverse().join("\n");
}

export type TextTransform =
  | "uppercase"
  | "lowercase"
  | "titlecase"
  | "camelcase"
  | "snakecase"
  | "kebabcase"
  | "trim"
  | "strip_formatting"
  | "json_prettify"
  | "json_minify"
  | "remove_duplicate_lines"
  | "sort_lines"
  | "reverse_lines";

export const TRANSFORM_LABELS: Record<TextTransform, string> = {
  uppercase: "UPPERCASE",
  lowercase: "lowercase",
  titlecase: "Title Case",
  camelcase: "camelCase",
  snakecase: "snake_case",
  kebabcase: "kebab-case",
  trim: "Trim Whitespace",
  strip_formatting: "Strip Formatting",
  json_prettify: "JSON Prettify",
  json_minify: "JSON Minify",
  remove_duplicate_lines: "Remove Duplicates",
  sort_lines: "Sort Lines",
  reverse_lines: "Reverse Lines",
};

export function applyTransform(
  text: string,
  transform: TextTransform
): string | null {
  switch (transform) {
    case "uppercase":
      return toUpperCase(text);
    case "lowercase":
      return toLowerCase(text);
    case "titlecase":
      return toTitleCase(text);
    case "camelcase":
      return toCamelCase(text);
    case "snakecase":
      return toSnakeCase(text);
    case "kebabcase":
      return toKebabCase(text);
    case "trim":
      return trimWhitespace(text);
    case "strip_formatting":
      return stripFormatting(text);
    case "json_prettify":
      return prettifyJSON(text);
    case "json_minify":
      return minifyJSON(text);
    case "remove_duplicate_lines":
      return removeDuplicateLines(text);
    case "sort_lines":
      return sortLines(text);
    case "reverse_lines":
      return reverseLines(text);
    default:
      return null;
  }
}
