/*
 * Turns two operation descriptors (the server's `describeOperation(..., { detail: true })` output for an
 * older and a newer version of the same endpoint) into a structured comparison the UI can render.
 * Either side may be null (the endpoint does not exist in that version).
 */
import { compareMaps, countStatuses, describeEntry, diffLines, flattenSchema, formFieldMap, jsonLines, parameterMap, summarizeRows, textLines } from "./diff.js";

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

const anyCount = (c) => c.added + c.removed + c.changed + (c.renamed ?? 0) > 0;
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
  // The whole endpoint was added or removed: its fields do not "change", they only exist on one
  // side. Consumers use the removed/added flags as badges instead of "changed", and identical
  // old/new values are never paired up.
  const removed = Boolean(oldOp && !newOp);
  const added = Boolean(!oldOp && newOp);
  const text = (label, before, after) => {
    const rows = diffLines(textLines(before), textLines(after));
    return { label, rows, counts: summarizeRows(rows), oldText: before ?? "", newText: after ?? "", changed: (before ?? "") !== (after ?? "") };
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
  const authChanged = removed || added ? false : Boolean(oldOp && newOp) && oldOp.requiresAuth !== newOp.requiresAuth;
  return {
    items,
    removed,
    added,
    auth: { old: oldOp?.requiresAuth ?? null, new: newOp?.requiresAuth ?? null, changed: authChanged },
    changed:
      authChanged ||
      (removed || added
        ? items.some((item) => (item.rows ? item.rows.some((row) => row.type !== "same") : (item.old ?? item.new ?? []).length > 0))
        : items.some((i) => i.changed)),
  };
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
            body.fieldCounts.renamed > 0 && `${body.fieldCounts.renamed} renamed`,
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
            parameters.counts.renamed > 0 && `${parameters.counts.renamed} renamed`,
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

  return {
    body,
    parameters,
    responses,
    docs,
    summary,
    changes: changeList(body, parameters, responses, docs),
    changed: summary.some((s) => s.changed),
    equal: sameJson(oldOp, newOp),
  };
}

const parameterName = (key) => {
  const [where, ...name] = key.split(":");
  return { name: name.join(":"), where: where === "path" ? "Path parameter" : where === "header" ? "Header" : "Query parameter" };
};

/** One plain-language line per field row that is not unchanged. */
function fieldChanges(rows, area, nameOf = (key) => ({ name: key, where: area })) {
  return rows
    .filter((row) => row.status !== "same")
    .map((row) => {
      const { name, where } = nameOf(row.key);
      const oldName = row.oldKey ? nameOf(row.oldKey).name : null;
      const detail =
        row.status === "changed" ? { from: describeEntry(row.old), to: describeEntry(row.new) } : { text: describeEntry(row.new ?? row.old) };
      return { kind: row.status, area: where, name, oldName, ...detail };
    });
}

/**
 * Every difference between the two operations as a flat list, most important first:
 * [{ kind: added | removed | renamed | changed, area, name?, oldName?, text? | from/to }].
 */
function changeList(body, parameters, responses, docs) {
  const list = [];
  const onOff = (value) => (value ? "required" : "public");
  if (docs.auth.changed) list.push({ kind: "changed", area: "Authentication", from: onOff(docs.auth.old), to: onOff(docs.auth.new) });

  if (body.presence === "added" || body.presence === "removed") list.push({ kind: body.presence, area: "Request body", text: `the whole body (${body.contentType.new ?? body.contentType.old})` });
  if (body.contentType.changed) list.push({ kind: "changed", area: "Request body", name: "content type", from: body.contentType.old, to: body.contentType.new });
  if (body.required.changed) list.push({ kind: "changed", area: "Request body", name: "required", from: body.required.old ? "yes" : "no", to: body.required.new ? "yes" : "no" });
  if (body.presence === "both") list.push(...fieldChanges(body.fieldRows, "Request body field"));
  if (body.presence === "both" && !anyCount(body.fieldCounts) && anyCount(body.exampleCounts)) list.push({ kind: "changed", area: "Request body", text: "example values changed" });

  list.push(...fieldChanges(parameters.rows, "Parameter", parameterName));

  for (const item of responses.items) {
    const area = `Response ${item.status}`;
    if (item.presence !== "both") {
      list.push({ kind: item.presence, area, text: item.new?.description ?? item.old?.description ?? "" });
      continue;
    }
    if (item.descriptionChanged) list.push({ kind: "changed", area, name: "description", from: item.old.description, to: item.new.description });
    list.push(...fieldChanges(item.fieldRows, `${area} field`));
    if (!anyCount(item.fieldCounts) && anyCount(item.exampleCounts)) list.push({ kind: "changed", area, text: "example values changed" });
  }

  for (const item of docs.items.filter((i) => i.changed)) {
    if (docs.removed) list.push({ kind: "removed", area: item.label, text: (item.oldText ?? (item.old ?? []).join(", ")) || "" });
    else if (docs.added) list.push({ kind: "added", area: item.label, text: (item.newText ?? (item.new ?? []).join(", ")) || "" });
    else if (item.rows) list.push({ kind: "changed", area: item.label, text: "wording changed" });
    else list.push({ kind: "changed", area: item.label, from: item.old.join(", ") || "none", to: item.new.join(", ") || "none" });
  }
  return list;
}
