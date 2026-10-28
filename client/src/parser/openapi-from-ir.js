/*
 * Converts the parser's intermediate representation (IR) into an OpenAPI 3.0.3 document.
 *
 * - security: "bearer" endpoints reference the BearerAuth scheme, "public" ones get `security: []`
 *   (which is how tools, including this platform's request tester, know no token is needed)
 * - permissions are kept as `x-permissions`
 * - every operation gets a unique operationId derived from its method and path
 * - IR flags with no OpenAPI equivalent (typeUnknown, placeholder) are dropped; they are
 *   reported as parser warnings instead
 */
import { reasonPhrase } from "./markdown/endpoint-details.js";

const SUCCESS_FALLBACK = "2XX";

export function schemaToOpenApi(schema) {
    const out = { type: schema.type };
    if (schema.nullable) out.nullable = true;
    if (schema.description) out.description = schema.description;
    if (schema.format) out.format = schema.format;
    if (schema.enum) out.enum = schema.enum;
    if (schema.default !== undefined) out.default = schema.default;
    if (schema.minimum !== undefined) out.minimum = schema.minimum;
    if (schema.maximum !== undefined) out.maximum = schema.maximum;
    if (schema.minLength !== undefined) out.minLength = schema.minLength;
    if (schema.maxLength !== undefined) out.maxLength = schema.maxLength;
    if (schema.properties) {
        out.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, schemaToOpenApi(value)]));
    }
    // An empty `required` list is invalid in OpenAPI 3.0.
    if (schema.required?.length) out.required = schema.required;
    if (schema.requiredWhen && Object.keys(schema.requiredWhen).length) out["x-required-when"] = schema.requiredWhen;
    if (schema.type === "array") out.items = schema.items ? schemaToOpenApi(schema.items) : { type: "string" };
    return out;
}

function bodyContent(body) {
    const media = { schema: schemaToOpenApi(body.schema) };
    if (body.example !== undefined) media.example = body.example;
    return { [body.contentType]: media };
}

function operationId(method, path, used) {
    const base = `${method.toLowerCase()}_${path.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "root"}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return id;
}

function parametersOf(endpoint) {
    const parameters = endpoint.request.parameters.map((p) => ({
        name: p.name,
        in: p.in,
        required: p.in === "path" ? true : Boolean(p.required.value),
        schema: schemaToOpenApi(p.schema),
        ...(p.description ? { description: p.description } : {}),
        ...(p.example !== undefined ? { example: p.example } : {}),
    }));
    // A templated path must declare each placeholder.
    for (const [, name] of endpoint.path.matchAll(/\{([^}]+)\}/g)) {
        if (!parameters.some((p) => p.in === "path" && p.name === name)) {
            parameters.push({ name, in: "path", required: true, schema: { type: "string" } });
        }
    }
    return parameters;
}

function responsesOf(endpoint) {
    const responses = {};
    const ordered = [...endpoint.responses].sort((a, b) => String(a.status.value).localeCompare(String(b.status.value)));
    for (const response of ordered) {
        const key = String(response.status.value);
        const entry = { description: response.description || reasonPhrase(response.status.value) };
        if (response.body) entry.content = bodyContent(response.body.value);
        responses[key] = entry;
    }
    // OpenAPI requires at least one response; many endpoints document only their errors.
    const hasSuccess = Object.keys(responses).some((k) => /^2/.test(k));
    if (!hasSuccess) responses[SUCCESS_FALLBACK] = { description: reasonPhrase(SUCCESS_FALLBACK) };
    return Object.fromEntries(Object.entries(responses).sort(([a], [b]) => a.localeCompare(b)));
}

export function irToOpenApi(spec) {
    const paths = {};
    const tags = [];
    const usedIds = new Set();

    for (const endpoint of spec.endpoints) {
        const method = endpoint.method.value.toLowerCase();
        const operation = {
            operationId: operationId(endpoint.method.value, endpoint.path, usedIds),
            ...(endpoint.summary ? { summary: endpoint.summary } : {}),
            ...(endpoint.description && endpoint.description !== endpoint.summary ? { description: endpoint.description } : {}),
        };
        if (endpoint.tag) {
            operation.tags = [endpoint.tag];
            if (!tags.includes(endpoint.tag)) tags.push(endpoint.tag);
        }
        operation.security = endpoint.security.value === "public" ? [] : [{ BearerAuth: [] }];
        if (endpoint.permissionsAnyOf?.value.length) operation["x-permissions-any-of"] = endpoint.permissionsAnyOf.value;
        else if (endpoint.permissions.value.length) operation["x-permissions"] = endpoint.permissions.value;
        if (endpoint.aliasOf) operation["x-alias-of"] = endpoint.aliasOf;

        const parameters = parametersOf(endpoint);
        if (parameters.length) operation.parameters = parameters;
        if (endpoint.request.body) {
            operation.requestBody = {
                required: !endpoint.request.bodyOptional,
                content: bodyContent(endpoint.request.body.value),
            };
        }
        operation.responses = responsesOf(endpoint);

        (paths[endpoint.path] ??= {})[method] = operation;
    }

    return {
        openapi: "3.0.3",
        info: {
            title: spec.title,
            version: spec.version.value,
            ...(spec.description ? { description: spec.description } : {}),
        },
        ...(spec.servers?.length ? { servers: spec.servers } : {}),
        tags: tags.map((name) => ({ name })),
        paths,
        components: {
            securitySchemes: { BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
        },
    };
}
