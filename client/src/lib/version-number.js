/**
 * Version naming helpers for the "Add a new version" form.
 *
 * The first version saved in a project may be named freely. Every later version should keep that
 * initial version's format (prefix, separators, digit groups) with a numeric increment, and no two
 * versions in a project may share a name (the backend rejects duplicates with a 409 as well).
 */

/** Splits "v1.2.0" into [{kind:"lit",text:"v"},{kind:"num",value:1},{kind:"lit",text:"."}, …]. */
function tokensOf(value) {
  const text = String(value ?? "").trim();
  const tokens = [];
  const pattern = /(\d+)|(\D+)/g;
  let match;
  while ((match = pattern.exec(text))) {
    if (match[1] !== undefined) tokens.push({ kind: "num", value: Number(match[1]), width: match[1].length });
    else tokens.push({ kind: "lit", text: match[2] });
  }
  return tokens;
}

const render = (tokens) => tokens.map((token) => (token.kind === "num" ? String(token.value).padStart(token.width, "0") : token.text)).join("");

const isTaken = (candidate, existing) =>
  existing.some((name) => String(name ?? "").trim().toLowerCase() === candidate.toLowerCase());

/** True when `number` is already used by a version of the project (trimmed, case-insensitive). */
export function isVersionTaken(number, existing = []) {
  const candidate = String(number ?? "").trim();
  return Boolean(candidate) && isTaken(candidate, existing);
}

/** Numeric values may differ, but a project's prefix, separators and number groups stay fixed. */
export function matchesVersionTemplate(number, template) {
  const candidate = String(number ?? "").trim();
  const pattern = tokensOf(template);
  if (!candidate || pattern.length === 0) return false;
  const expression = pattern.map((token) => (
    token.kind === "num" ? "\\d+" : token.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  )).join("");
  return new RegExp(`^${expression}$`).test(candidate);
}

/**
 * Suggests the next version number for a project.
 *
 * @param {string[]} existingOldestFirst version numbers ordered oldest first, so `[0]` is the very
 *   first version the user created — its format is the template every suggestion follows.
 * @returns {string|null} the next number, or null when the project has no versions yet (the first
 *   name is free-form).
 */
export function suggestNextVersion(existingOldestFirst = []) {
  const existing = existingOldestFirst.map((name) => String(name ?? "").trim()).filter(Boolean);
  if (existing.length === 0) return null;

  const format = existing[0];
  const latest = existing[existing.length - 1];
  const template = tokensOf(format);
  const latestNumbers = tokensOf(latest).filter((token) => token.kind === "num").map((token) => token.value);

  // Format literals come from the initial version; the numbers come from the latest version, so a
  // freely typed name like "1.1.0" is re-expressed as the template's "v1.1.0".
  let latestIndex = 0;
  const base = template.map((token) => {
    if (token.kind !== "num") return token;
    if (latestIndex < latestNumbers.length) return { kind: "num", value: latestNumbers[latestIndex++], width: token.width };
    return { kind: "num", value: token.value };
  });

  const lastNumber = base.map((token) => token.kind === "num").lastIndexOf(true);
  if (lastNumber === -1) {
    // The initial name has no digits at all (e.g. "beta"): grow a numeric suffix instead.
    let n = existing.length + 1;
    let candidate = `${format}-${n}`;
    while (isTaken(candidate, existing)) candidate = `${format}-${++n}`;
    return candidate;
  }

  // Always move at least one increment past the latest version, then skip any name already in use.
  base[lastNumber].value += 1;
  let candidate = render(base);
  while (isTaken(candidate, existing)) {
    base[lastNumber].value += 1;
    candidate = render(base);
  }
  return candidate;
}
