const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const OPERATION_FIELDS = ["operationId", "summary", "description", "tags", "deprecated", "security", "x-permission", "x-permissions"];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const same = (left, right) => canonicalJson(left ?? null) === canonicalJson(right ?? null);
const parameterKey = (parameter) => `${parameter.in}:${parameter.name}`;

function collectOperations(spec) {
  const operations = new Map();
  for (const [path, pathItem] of Object.entries(spec?.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
      const merged = new Map(parameters.map((parameter) => [parameterKey(parameter), parameter]));
      operations.set(`${method.toUpperCase()} ${path}`, {
        method: method.toUpperCase(),
        path,
        operation: { ...operation, parameters: [...merged.values()] },
      });
    }
  }
  return operations;
}

function diffNamed(beforeItems, afterItems, keyOf) {
  const before = new Map(beforeItems.map((item) => [keyOf(item), item]));
  const after = new Map(afterItems.map((item) => [keyOf(item), item]));
  return {
    added: [...after.keys()].filter((key) => !before.has(key)),
    removed: [...before.keys()].filter((key) => !after.has(key)),
    changed: [...after.keys()].filter((key) => before.has(key) && !same(before.get(key), after.get(key))),
    before,
    after,
  };
}

function diffOperation(before, after) {
  const changes = {};
  const breaking = [];

  const fields = OPERATION_FIELDS.filter((field) => !same(before[field], after[field]));
  if (fields.length) changes.fields = fields;
  if (after.security?.length && !before.security?.length) breaking.push("authentication now required");

  const parameters = diffNamed(before.parameters ?? [], after.parameters ?? [], parameterKey);
  if (parameters.added.length || parameters.removed.length || parameters.changed.length) {
    changes.parameters = { added: parameters.added, removed: parameters.removed, changed: parameters.changed };
    for (const key of parameters.added) {
      if (parameters.after.get(key).required) breaking.push(`new required parameter ${key}`);
    }
    for (const key of parameters.changed) {
      const oldParameter = parameters.before.get(key);
      const newParameter = parameters.after.get(key);
      if ((!oldParameter.required && newParameter.required) || !same(oldParameter.schema, newParameter.schema)) {
        breaking.push(`parameter ${key} changed incompatibly`);
      }
    }
  }

  if (!same(before.requestBody, after.requestBody)) {
    changes.requestBody = !before.requestBody ? "added" : !after.requestBody ? "removed" : "changed";
    if (after.requestBody?.required && !before.requestBody?.required) breaking.push("request body is now required");
    else if (before.requestBody && after.requestBody) breaking.push("request body changed");
  }

  const responses = diffNamed(
    Object.entries(before.responses ?? {}).map(([status, response]) => ({ status, response })),
    Object.entries(after.responses ?? {}).map(([status, response]) => ({ status, response })),
    (response) => response.status,
  );
  if (responses.added.length || responses.removed.length || responses.changed.length) {
    changes.responses = { added: responses.added, removed: responses.removed, changed: responses.changed };
    for (const status of responses.removed) breaking.push(`response ${status} removed`);
    for (const status of responses.changed) breaking.push(`response ${status} changed`);
  }

  return { changes, breaking };
}

function pick(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object?.[key] ?? null]));
}

/** Compare two OpenAPI documents, including operation changes and likely breaking changes. */
export function diffSpecs(beforeSpec, afterSpec) {
  const before = collectOperations(beforeSpec);
  const after = collectOperations(afterSpec);
  const added = [];
  const removed = [];
  const changed = [];
  const breaking = [];

  for (const [key, entry] of after) {
    if (!before.has(key)) added.push({ method: entry.method, path: entry.path, summary: entry.operation.summary ?? null });
  }
  for (const [key, entry] of before) {
    if (!after.has(key)) {
      removed.push({ method: entry.method, path: entry.path, summary: entry.operation.summary ?? null });
      breaking.push({ method: entry.method, path: entry.path, reason: "endpoint removed" });
      continue;
    }
    const next = after.get(key);
    if (same(entry.operation, next.operation)) continue;
    const detail = diffOperation(entry.operation, next.operation);
    changed.push({ method: entry.method, path: entry.path, ...detail.changes, breaking: detail.breaking });
    for (const reason of detail.breaking) breaking.push({ method: entry.method, path: entry.path, reason });
  }

  const schemas = diffNamed(
    Object.entries(beforeSpec?.components?.schemas ?? {}).map(([name, schema]) => ({ name, schema })),
    Object.entries(afterSpec?.components?.schemas ?? {}).map(([name, schema]) => ({ name, schema })),
    (schema) => schema.name,
  );
  const infoFields = ["title", "version", "description"].filter((field) => !same(beforeSpec?.info?.[field], afterSpec?.info?.[field]));

  return {
    identical: same(beforeSpec, afterSpec),
    summary: {
      endpointsAdded: added.length,
      endpointsRemoved: removed.length,
      endpointsChanged: changed.length,
      schemasAdded: schemas.added.length,
      schemasRemoved: schemas.removed.length,
      schemasChanged: schemas.changed.length,
      breakingChanges: breaking.length,
    },
    endpoints: { added, removed, changed },
    schemas: { added: schemas.added, removed: schemas.removed, changed: schemas.changed },
    info: { changedFields: infoFields, from: pick(beforeSpec?.info, infoFields), to: pick(afterSpec?.info, infoFields) },
    breaking,
  };
}
