/*
 * Turns two operation descriptors (the server's `describeOperation(..., { detail: true })` output for an
 * older and a newer version of the same endpoint) into a structured comparison the UI can render.
 * Either side may be null (the endpoint does not exist in that version).
 */
import { compareMaps, countStatuses, diffLines, flattenSchema, formFieldMap, jsonLines, parameterMap, summarizeRows, textLines } from "./diff.js";

const MULTIPART = "multipart/form-data";

function bodyFields(body) {
  if (!body) return new Map();
  return body.contentType === MULTIPART ? formFieldMap(body.fields) : flattenSchema(body.schema);
}

/** The documented example, else the sample generated from the schema (flagged as generated). */
function exampleOf(body) {
  if (!body) return { value: null, generated: false };
  if (body.example !== undefined && body.example !== null) return { value: body.example, generated: false };
  return { value: body.sample ?? null, generated: body.sample != null };
}

const anyCount = (c) => c.added + c.removed + c.changed > 0;
const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function presenceOf(before, after) {
  if (!before && !after) return "none";
  if (!before) return "added";
  if (!after) return "removed";
  return "both";
}

function compareBody(oldBody, newBody) {
  const fieldRows = compareMaps(bodyFields(oldBody), bodyFields(newBody));
  const before = exampleOf(oldBody);
  const after = exampleOf(newBody);
  const exampleRows = diffLines(jsonLines(before.value), jsonLines(after.value));
  const presence = presenceOf(oldBody, newBody);
  const fieldCounts = countStatuses(fieldRows);
  const exampleCounts = summarizeRows(exampleRows);
  const contentTypeChanged = presence === "both" && oldBody.contentType !== newBody.contentType;
  const requiredChanged = presence === "both" && Boolean(oldBody.required) !== Boolean(newBody.required);
  return {
    presence,
    contentType: { old: oldBody?.contentType ?? null, new: newBody?.contentType ?? null, changed: contentTypeChanged },
    required: { old: oldBody?.required ?? null, new: newBody?.required ?? null, changed: requiredChanged },
    fieldRows,
    fieldCounts,
    exampleRows,
    exampleCounts,
    generated: { old: before.generated, new: after.generated },
    changed: presence === "added" || presence === "removed" || contentTypeChanged || requiredChanged || anyCount(fieldCounts) || anyCount(exampleCounts),
  };
}

function compareParameters(oldOp, newOp) {
  const rows = compareMaps(parameterMap(oldOp?.parameters), parameterMap(newOp?.parameters));
  const counts = countStatuses(rows);
  return { rows, counts, changed: anyCount(counts) };
}

function compareResponses(oldOp, newOp) {
  const oldBy = new Map((oldOp?.responses ?? []).map((r) => [r.status, r]));
  const newBy = new Map((newOp?.responses ?? []).map((r) => [r.status, r]));
  const statuses = [...new Set([...oldBy.keys(), ...newBy.keys()])].sort((a, b) => a.localeCompare(b));
  const items = statuses.map((status) => {
    const before = oldBy.get(status) ?? null;
    const after = newBy.get(status) ?? null;
    const fieldRows = compareMaps(flattenSchema(before?.schema), flattenSchema(after?.schema));
    const exampleRows = diffLines(jsonLines(before?.example), jsonLines(after?.example));
    const presence = presenceOf(before, after);
    const descriptionChanged = presence === "both" && (before.description ?? "") !== (after.description ?? "");
    const fieldCounts = countStatuses(fieldRows);
    const exampleCounts = summarizeRows(exampleRows);
    return {
      status,
      presence,
      old: before,
      new: after,
      descriptionChanged,
      fieldRows,
      fieldCounts,
      exampleRows,
      exampleCounts,
      hasExample: Boolean(before?.example != null || after?.example != null),
      changed: presence !== "both" || descriptionChanged || anyCount(fieldCounts) || anyCount(exampleCounts),
    };
  });
  const counts = {
    added: items.filter((i) => i.presence === "added").length,
    removed: items.filter((i) => i.presence === "removed").length,
    changed: items.filter((i) => i.presence === "both" && i.changed).length,
  };
  return { items, counts, changed: items.some((i) => i.changed) };
}

function compareDocs(oldOp, newOp) {
  const text = (label, before, after) => {
    const rows = diffLines(textLines(before), textLines(after));
    return { label, rows, counts: summarizeRows(rows), changed: (before ?? "") !== (after ?? "") };
  };
  const list = (label, before = [], after = []) => ({
    label,
    old: before,
    new: after,
    changed: [...before].sort().join("|") !== [...after].sort().join("|"),
  });
  const items = [
    text("Summary", oldOp?.summary, newOp?.summary),
    text("Notes (description)", oldOp?.description, newOp?.description),
    list("Permissions", oldOp?.permissions, newOp?.permissions),
    list("Tags", oldOp?.tags, newOp?.tags),
  ];
  const authChanged = Boolean(oldOp && newOp) && oldOp.requiresAuth !== newOp.requiresAuth;
  return { items, auth: { old: oldOp?.requiresAuth ?? null, new: newOp?.requiresAuth ?? null, changed: authChanged }, changed: authChanged || items.some((i) => i.changed) };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function joinParts(parts) {
  return parts.filter(Boolean).join(" · ");
}

/** The full comparison of two operation descriptors. */
export function buildComparison(oldOp, newOp) {
  const body = compareBody(oldOp?.requestBody ?? null, newOp?.requestBody ?? null);
  const parameters = compareParameters(oldOp, newOp);
  const responses = compareResponses(oldOp, newOp);
  const docs = compareDocs(oldOp, newOp);

  const summary = [
    {
      id: "body",
      label: "Request body",
      changed: body.changed,
      text: !body.changed
        ? body.presence === "none"
          ? "none in either version"
          : "unchanged"
        : joinParts([
            body.presence === "added" && "added",
            body.presence === "removed" && "removed",
            body.contentType.changed && `${body.contentType.old} → ${body.contentType.new}`,
            body.required.changed && (body.required.new ? "now required" : "now optional"),
            body.fieldCounts.added > 0 && `${plural(body.fieldCounts.added, "field")} added`,
            body.fieldCounts.removed > 0 && `${body.fieldCounts.removed} removed`,
            body.fieldCounts.changed > 0 && `${body.fieldCounts.changed} changed`,
            !anyCount(body.fieldCounts) && anyCount(body.exampleCounts) && "example changed",
          ]),
    },
    {
      id: "parameters",
      label: "Parameters",
      changed: parameters.changed,
      text: parameters.changed
        ? joinParts([
            parameters.counts.added > 0 && `${parameters.counts.added} added`,
            parameters.counts.removed > 0 && `${parameters.counts.removed} removed`,
            parameters.counts.changed > 0 && `${parameters.counts.changed} changed`,
          ])
        : parameters.rows.length
          ? "unchanged"
          : "none",
    },
    {
      id: "responses",
      label: "Responses",
      changed: responses.changed,
      text: responses.changed
        ? joinParts([
            responses.counts.added > 0 && `${responses.counts.added} added`,
            responses.counts.removed > 0 && `${responses.counts.removed} removed`,
            responses.counts.changed > 0 && `${responses.counts.changed} changed`,
          ])
        : responses.items.length
          ? "unchanged"
          : "none",
    },
    {
      id: "docs",
      label: "Documentation",
      changed: docs.changed,
      text: docs.changed ? joinParts(docs.items.filter((i) => i.changed).map((i) => i.label.toLowerCase()).concat(docs.auth.changed ? ["auth"] : [])) : "unchanged",
    },
  ];

  return { body, parameters, responses, docs, summary, changed: summary.some((s) => s.changed), equal: sameJson(oldOp, newOp) };
}
