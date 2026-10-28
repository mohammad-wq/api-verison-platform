// Builds the tester's endpoint descriptors from an OpenAPI document.

const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

function resolveSchema(spec, schema, stack = new Set()) {
  if (!schema || typeof schema !== "object") return schema ?? {};
  if (!schema.$ref) return schema;
  const ref = schema.$ref;
  if (!ref.startsWith("#/") || stack.has(ref)) return {};
  const resolved = ref.slice(2).split("/").reduce((value, key) => value?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], spec);
  return resolved ? resolveSchema(spec, resolved, new Set([...stack, ref])) : {};
}

function sampleFor(spec, schema, depth = 0) {
  if (!schema || depth > 5) return null;
  const resolved = resolveSchema(spec, schema);
  if (resolved.example !== undefined) return resolved.example;
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.enum?.length) return resolved.enum[0];
  if (resolved.type === "object" || resolved.properties) {
    return Object.fromEntries(
      Object.entries(resolved.properties ?? {}).map(([key, value]) => [key, sampleFor(spec, value, depth + 1)]),
    );
  }
  if (resolved.type === "array") return [sampleFor(spec, resolved.items, depth + 1)];
  if (resolved.type === "integer" || resolved.type === "number") return 0;
  if (resolved.type === "boolean") return false;
  return resolved.format === "binary" ? null : "";
}

export function operationDescriptor(spec, method, path, pathItem, operation) {
  const parametersByKey = new Map();
  for (const parameter of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
    const resolved = resolveSchema(spec, parameter);
    const key = `${resolved.in}:${resolved.name}`;
    parametersByKey.set(key, {
      name: resolved.name,
      in: resolved.in,
      required: Boolean(resolved.required),
      description: resolved.description,
      type: resolveSchema(spec, resolved.schema)?.type ?? "string",
      format: resolveSchema(spec, resolved.schema)?.format,
      enum: resolveSchema(spec, resolved.schema)?.enum,
      default: resolveSchema(spec, resolved.schema)?.default,
      example: resolved.example ?? resolveSchema(spec, resolved.schema)?.example,
    });
  }

  let requestBody = null;
  const body = resolveSchema(spec, operation.requestBody);
  if (body?.content) {
    const contentType = Object.keys(body.content).sort((a, b) => {
      const rank = (value) => value.includes("json") ? 0 : value.includes("urlencoded") ? 1 : value.includes("multipart") ? 2 : 3;
      return rank(a) - rank(b);
    })[0];
    const media = body.content[contentType];
    const schema = resolveSchema(spec, media?.schema);
    const required = new Set(schema.required ?? []);
    const fields = Object.entries(schema.properties ?? {}).map(([name, fieldSchema]) => {
      const field = resolveSchema(spec, fieldSchema);
      return {
        name,
        type: field.type ?? "string",
        required: required.has(name),
        description: field.description,
        file: field.format === "binary",
      };
    });
    requestBody = {
      contentType,
      required: Boolean(body.required),
      fields,
      schema,
      sample: media?.example ?? Object.values(media?.examples ?? {})[0]?.value ?? sampleFor(spec, schema),
    };
  }

  const security = operation.security ?? spec.security ?? [];
  const responses = Object.entries(operation.responses ?? {}).map(([status, response]) => {
    const content = response.content ?? {};
    const mediaType = Object.keys(content)[0];
    const media = content[mediaType] ?? {};
    return {
      status,
      description: response.description ?? "",
      schema: resolveSchema(spec, media.schema),
      example: media.example ?? Object.values(media.examples ?? {})[0]?.value,
    };
  });
  return {
    method,
    path,
    operationId: operation.operationId,
    summary: operation.summary ?? "",
    description: operation.description ?? "",
    tags: operation.tags ?? [],
    parameters: [...parametersByKey.values()],
    requestBody,
    responses,
    permissions: operation["x-permissions"] ?? [],
    requiresAuth: Array.isArray(security) && security.length > 0,
  };
}

/** "METHOD /path" -> descriptor, for every operation in the document. */
export function operationsForSpec(spec = {}) {
  const operations = new Map();
  for (const [path, pathItem] of Object.entries(spec?.paths ?? {})) {
    for (const method of METHODS) {
      if (pathItem?.[method]) {
        const descriptor = operationDescriptor(spec, method.toUpperCase(), path, pathItem, pathItem[method]);
        operations.set(`${method.toUpperCase()} ${path}`, descriptor);
      }
    }
  }
  return operations;
}
