/*
 * Schema inference from examples.
 *
 * Examples only ever provide types. Requiredness is never inferred here.
 * Every schema gets a concrete type. When the example cannot reveal it
 * (null, empty array), the schema falls back to string and is flagged
 * `typeUnknown`, so the caller can warn about it.
 */
export function inferSchema(node) {
    const schema = inferSchemaValue(node);
    return node.comment ? applyComment(schema, node.comment) : schema;
}
function inferSchemaValue(node) {
    switch (node.t) {
        case "null":
            return { type: "string", nullable: true, typeUnknown: true };
        case "string":
            return { type: "string" };
        case "boolean":
            return { type: "boolean" };
        case "number":
            return { type: /[.eE]/.test(node.raw) ? "number" : "integer" };
        case "array":
            return {
                type: "array",
                items: node.items.length === 0
                    ? unknownSchema()
                    : node.items.map(inferSchema).reduce(mergeSchemas)
            };
        case "object": {
            if (node.entries.length === 1 && node.entries[0][0] === "...") {
                return { type: "object", placeholder: true };
            }
            const properties = {};
            for (const [key, value] of node.entries) {
                const schema = inferSchema(value);
                properties[key] =
                    key in properties ? mergeSchemas(properties[key], schema) : schema;
            }
            return { type: "object", properties };
        }
    }
}
function applyComment(schema, comment) {
    const out = { ...schema, description: comment };
    if (out.type === "string") {
        if (/\bemail\b/i.test(comment)) out.format = "email";
        const minLength = comment.match(/\bmin(?:imum)?\s+(\d+)\s*(?:characters?|chars?)/i);
        const maxLength = comment.match(/\bmax(?:imum)?\s+(\d+)\s*(?:characters?|chars?)/i);
        if (minLength) out.minLength = Number(minLength[1]);
        if (maxLength) out.maxLength = Number(maxLength[1]);
    } else if (out.type === "integer" || out.type === "number") {
        const minimum = comment.match(/\bmin(?:imum)?\s+(-?\d+(?:\.\d+)?)(?!\s*(?:characters?|chars?))/i);
        const maximum = comment.match(/\bmax(?:imum)?\s+(-?\d+(?:\.\d+)?)(?!\s*(?:characters?|chars?))/i);
        if (minimum) out.minimum = Number(minimum[1]);
        if (maximum) out.maximum = Number(maximum[1]);
    }
    return out;
}
export function unknownSchema() {
    return { type: "string", typeUnknown: true };
}
/* Combines two example-derived schemas for the same position (array items). */
export function mergeSchemas(a, b) {
    if (a.typeUnknown && !b.typeUnknown) {
        return { ...b, nullable: a.nullable || b.nullable || undefined };
    }
    if (b.typeUnknown && !a.typeUnknown) {
        return { ...a, nullable: a.nullable || b.nullable || undefined };
    }
    if (a.placeholder && b.type === "object")
        return b;
    if (b.placeholder && a.type === "object")
        return a;
    if (a.type === "object" && b.type === "object") {
        const properties = { ...(a.properties ?? {}) };
        for (const [key, schema] of Object.entries(b.properties ?? {})) {
            properties[key] =
                key in properties ? mergeSchemas(properties[key], schema) : schema;
        }
        return { ...a, properties };
    }
    if (a.type === "array" && b.type === "array") {
        return {
            ...a,
            items: a.items && b.items ? mergeSchemas(a.items, b.items) : a.items ?? b.items
        };
    }
    if ((a.type === "integer" && b.type === "number") ||
        (a.type === "number" && b.type === "integer")) {
        return { ...a, type: "number" };
    }
    if (a.type === b.type) {
        return { ...a, nullable: a.nullable || b.nullable || undefined };
    }
    /* Conflicting example types: keep the first, flag the position. */
    return { ...a, typeUnknown: true };
}
/* Collects JSON-pointer-ish paths of flagged positions, in document order. */
export function collectSchemaIssues(schema, path = "", issues = { unknownTypes: [], placeholders: [] }) {
    const here = path || "(root)";
    if (schema.typeUnknown)
        issues.unknownTypes.push(here);
    if (schema.placeholder)
        issues.placeholders.push(here);
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
        collectSchemaIssues(child, path ? `${path}.${key}` : key, issues);
    }
    if (schema.items)
        collectSchemaIssues(schema.items, `${path}[]`, issues);
    return issues;
}
export function cloneSchema(schema) {
    return structuredClone(schema);
}
