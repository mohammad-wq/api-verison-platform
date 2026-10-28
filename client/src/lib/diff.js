/*
 * Pure helpers behind the side-by-side API comparison (no React, no DOM):
 *  - diffLines / collapseRows: an aligned two-column line diff, with long unchanged runs folded away
 *  - flattenSchema / compareMaps: a structural diff of request/response schemas, parameters and form fields
 */

const MAX_CELLS = 4_000_000; // LCS table size limit; beyond it a cheaper fallback is used

/** Longest common prefix/suffix of two strings, used to highlight just the part of a line that changed. */
function innerMarks(a, b) {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const left = [prefix, a.length - suffix];
  const right = [prefix, b.length - suffix];
  return { left: left[1] > left[0] ? left : null, right: right[1] > right[0] ? right : null };
}

/** Edit script ("same" | "del" | "add") between two arrays of lines. */
function editScript(a, b) {
  const n = a.length;
  const m = b.length;
  // Trim the common head and tail first: most example edits are small.
  let head = 0;
  while (head < n && head < m && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < n - head && tail < m - head && a[n - 1 - tail] === b[m - 1 - tail]) tail++;
  const ops = [];
  for (let i = 0; i < head; i++) ops.push("same");

  const an = n - head - tail;
  const bm = m - head - tail;
  if (an * bm > MAX_CELLS) {
    for (let i = 0; i < an; i++) ops.push("del");
    for (let j = 0; j < bm; j++) ops.push("add");
  } else if (an === 0 || bm === 0) {
    for (let i = 0; i < an; i++) ops.push("del");
    for (let j = 0; j < bm; j++) ops.push("add");
  } else {
    // lcs[i][j] = LCS length of a[head+i..] and b[head+j..]
    const width = bm + 1;
    const lcs = new Uint32Array((an + 1) * width);
    for (let i = an - 1; i >= 0; i--) {
      for (let j = bm - 1; j >= 0; j--) {
        lcs[i * width + j] = a[head + i] === b[head + j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < an && j < bm) {
      if (a[head + i] === b[head + j]) {
        ops.push("same");
        i++;
        j++;
      } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
        ops.push("del");
        i++;
      } else {
        ops.push("add");
        j++;
      }
    }
    while (i++ < an) ops.push("del");
    while (j++ < bm) ops.push("add");
  }
  for (let i = 0; i < tail; i++) ops.push("same");
  return ops;
}

/**
 * Aligned side-by-side rows for two texts (arrays of lines).
 * Each row: { type: "same" | "del" | "add" | "mod", left: {no, text} | null, right: {no, text} | null, marks? }
 * A run of removed lines followed by added lines is paired up line-by-line as "mod" rows, so an edited
 * line shows old and new next to each other (with `marks` = the character ranges that actually differ).
 */
export function diffLines(oldLines, newLines) {
  const ops = editScript(oldLines, newLines);
  const rows = [];
  let i = 0;
  let j = 0;
  for (let k = 0; k < ops.length; ) {
    if (ops[k] === "same") {
      rows.push({ type: "same", left: { no: i + 1, text: oldLines[i] }, right: { no: j + 1, text: newLines[j] } });
      i++;
      j++;
      k++;
      continue;
    }
    const dels = [];
    const adds = [];
    while (k < ops.length && ops[k] !== "same") {
      if (ops[k] === "del") dels.push(i++);
      else adds.push(j++);
      k++;
    }
    const paired = Math.min(dels.length, adds.length);
    for (let p = 0; p < paired; p++) {
      const left = { no: dels[p] + 1, text: oldLines[dels[p]] };
      const right = { no: adds[p] + 1, text: newLines[adds[p]] };
      rows.push({ type: "mod", left, right, marks: innerMarks(left.text, right.text) });
    }
    for (let p = paired; p < dels.length; p++) rows.push({ type: "del", left: { no: dels[p] + 1, text: oldLines[dels[p]] }, right: null });
    for (let p = paired; p < adds.length; p++) rows.push({ type: "add", left: null, right: { no: adds[p] + 1, text: newLines[adds[p]] } });
  }
  return rows;
}

/** Line counts of a diff: { added, removed, changed }. */
export function summarizeRows(rows) {
  const summary = { added: 0, removed: 0, changed: 0 };
  for (const row of rows) {
    if (row.type === "add") summary.added++;
    else if (row.type === "del") summary.removed++;
    else if (row.type === "mod") summary.changed++;
  }
  return summary;
}

/**
 * Folds long runs of unchanged rows into { type: "gap", count, rows } placeholders, keeping `context` rows
 * around every change. Nothing is folded when a run is not longer than 2 * context + 2.
 */
export function collapseRows(rows, context = 3) {
  const out = [];
  let k = 0;
  while (k < rows.length) {
    if (rows[k].type !== "same") {
      out.push(rows[k++]);
      continue;
    }
    let end = k;
    while (end < rows.length && rows[end].type === "same") end++;
    const run = rows.slice(k, end);
    const atStart = k === 0;
    const atEnd = end === rows.length;
    const keepHead = atStart ? 0 : context;
    const keepTail = atEnd ? 0 : context;
    if (run.length > keepHead + keepTail + 2) {
      out.push(...run.slice(0, keepHead));
      const hidden = run.slice(keepHead, run.length - keepTail);
      out.push({ type: "gap", count: hidden.length, rows: hidden });
      out.push(...run.slice(run.length - keepTail));
    } else {
      out.push(...run);
    }
    k = end;
  }
  return out;
}

/** Pretty text of a JSON value as an array of lines ([] for undefined/null). */
export function jsonLines(value) {
  if (value === undefined || value === null) return [];
  return JSON.stringify(value, null, 2).split("\n");
}

/** Plain text split into lines ([] when empty). */
export function textLines(text) {
  return text ? String(text).split("\n") : [];
}

/* ------------------------------------------------------------------ *
 * Structural comparison
 * ------------------------------------------------------------------ */

/**
 * Every field of a JSON schema as `path -> { type, format, required, enum, default, nullable, description }`.
 * Nested objects use dotted paths (`address.city`), array items use `[]` (`tags[]`, `lines[].qty`).
 */
export function flattenSchema(schema) {
  const out = new Map();
  const walk = (s, path, required, depth) => {
    if (!s || typeof s !== "object" || depth > 8) return;
    const type = s.type ?? (s.properties ? "object" : s.items ? "array" : null);
    if (path) {
      out.set(path, {
        type,
        format: s.format ?? null,
        required,
        enum: Array.isArray(s.enum) ? s.enum : null,
        default: s.default ?? null,
        nullable: Boolean(s.nullable),
        description: s.description ?? null,
      });
    }
    if (type === "object" || s.properties) {
      const requiredNames = new Set(Array.isArray(s.required) ? s.required : []);
      for (const [key, value] of Object.entries(s.properties ?? {})) walk(value, path ? `${path}.${key}` : key, requiredNames.has(key), depth + 1);
    } else if (type === "array" && s.items) {
      walk(s.items, `${path}[]`, false, depth + 1);
    }
  };
  walk(schema, "", false, 0);
  return out;
}

/** Form fields (the descriptor's multipart `fields`) in the same shape as flattenSchema's entries. */
export function formFieldMap(fields) {
  return new Map(
    (fields ?? []).map((f) => [
      f.name,
      { type: f.file ? "file" : f.type, format: f.format ?? null, required: Boolean(f.required), enum: f.enum ?? null, default: null, nullable: false, description: f.description ?? null },
    ]),
  );
}

/** Query/header parameters keyed `in:name`, in the same entry shape. */
export function parameterMap(parameters) {
  return new Map(
    (parameters ?? []).map((p) => [
      `${p.in}:${p.name}`,
      { type: p.type, format: p.format ?? null, required: Boolean(p.required), enum: p.enum ?? null, default: p.default ?? null, nullable: false, description: p.description ?? null },
    ]),
  );
}

export const entrySignature = (e) => JSON.stringify([e.type, e.format, e.required, e.enum, e.default, e.nullable]);

/** "string (date), required, one of a|b, default x" */
export function describeEntry(e) {
  if (!e) return "";
  const parts = [`${e.type ?? "any"}${e.format ? ` (${e.format})` : ""}${e.nullable ? ", nullable" : ""}`, e.required ? "required" : "optional"];
  if (e.enum) parts.push(`one of ${e.enum.join(" | ")}`);
  if (e.default !== null && e.default !== undefined) parts.push(`default ${e.default}`);
  return parts.join(", ");
}

/** "data.user.email" -> "data.user", "query:page" -> "query", "email" -> "". */
const parentOf = (key) => key.slice(0, Math.max(key.lastIndexOf("."), key.lastIndexOf(":"), 0));

/**
 * Merges a removed and an added row into one "renamed" row when they share a parent and an identical
 * definition, and no other removed/added row there has that definition (so the pairing is unambiguous).
 */
function pairRenames(rows, signature) {
  const groupKey = (row, side) => `${parentOf(row.key)}\u0000${signature(row[side])}`;
  const removed = new Map();
  const added = new Map();
  for (const row of rows) {
    if (row.status === "removed") removed.set(groupKey(row, "old"), [...(removed.get(groupKey(row, "old")) ?? []), row]);
    if (row.status === "added") added.set(groupKey(row, "new"), [...(added.get(groupKey(row, "new")) ?? []), row]);
  }
  const replaced = new Map();
  const dropped = new Set();
  for (const [group, gone] of removed) {
    const arrived = added.get(group);
    if (gone.length !== 1 || arrived?.length !== 1) continue;
    replaced.set(gone[0], { key: arrived[0].key, oldKey: gone[0].key, status: "renamed", old: gone[0].old, new: arrived[0].new });
    dropped.add(arrived[0]);
  }
  return rows.filter((row) => !dropped.has(row)).map((row) => replaced.get(row) ?? row);
}

/**
 * Row-by-row comparison of two keyed maps. Rows: { key, status: "added" | "removed" | "renamed" | "changed" | "same", old, new }.
 * A "renamed" row also has `oldKey`. Order: the old map's order, then keys that only exist in the new map.
 */
export function compareMaps(oldMap, newMap, signature = entrySignature) {
  const rows = [];
  for (const [key, before] of oldMap) {
    const after = newMap.get(key);
    if (!after) rows.push({ key, status: "removed", old: before, new: null });
    else rows.push({ key, status: signature(before) === signature(after) ? "same" : "changed", old: before, new: after });
  }
  for (const [key, after] of newMap) if (!oldMap.has(key)) rows.push({ key, status: "added", old: null, new: after });
  return pairRenames(rows, signature);
}

/** { added, removed, renamed, changed } counts of compareMaps rows. */
export function countStatuses(rows) {
  const counts = { added: 0, removed: 0, renamed: 0, changed: 0 };
  for (const row of rows) if (row.status in counts) counts[row.status]++;
  return counts;
}

/**
 * Flattens aligned rows into one list of unified-diff lines, for a single-column view.
 * Each line: { type: "same" | "del" | "add", text, oldNo, newNo, mark }. An edited ("mod") row becomes a
 * removed line followed by an added line, each carrying its `mark` (the changed character range).
 * The result can be folded with collapseRows, which only looks at `type`.
 */
export function unifiedRows(rows) {
  const out = [];
  for (const row of rows) {
    if (row.type === "same") out.push({ type: "same", text: row.left.text, oldNo: row.left.no, newNo: row.right.no, mark: null });
    else {
      if (row.left) out.push({ type: "del", text: row.left.text, oldNo: row.left.no, newNo: null, mark: row.marks?.left ?? null });
      if (row.right) out.push({ type: "add", text: row.right.text, oldNo: null, newNo: row.right.no, mark: row.marks?.right ?? null });
    }
  }
  return out;
}

/** The full text of one side ("left" = older, "right" = newer) of aligned rows, for copying. */
export function sideText(rows, side) {
  return rows
    .filter((row) => row[side])
    .map((row) => row[side].text)
    .join("\n");
}
