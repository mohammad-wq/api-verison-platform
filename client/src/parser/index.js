import { markdownToIr } from "./markdown/markdown-to-ir.js";
import { irToOpenApi } from "./openapi-from-ir.js";
import { collectSchemaIssues } from "./schema-inference.js";
import { endpointKey } from "./ir/types.js";

/**
 * Markdown API documentation -> OpenAPI document.
 * Returns { openapi, warnings, statistics }. `warnings` lists everything the parser had to
 * infer, default or skip (each with its line range in the input).
 */
export function parseMarkdownToOpenApi(markdown) {
    if (typeof markdown !== "string") {
        throw new TypeError(`Expected the API documentation as a Markdown string, received ${markdown === null ? "null" : typeof markdown}`);
    }
    const { spec, warnings } = markdownToIr(markdown);
    if (spec.endpoints.length === 0) {
        warnings.push({
            code: "NO_ENDPOINTS_FOUND",
            message: "No API endpoints were detected. Check the Markdown table headers and endpoint paths.",
            lines: [1, Math.max(1, markdown.split(/\r\n|\n|\r/).length)]
        });
    }
    const methods = {};
    const tags = new Set();
    for (const endpoint of spec.endpoints) {
        methods[endpoint.method.value] = (methods[endpoint.method.value] ?? 0) + 1;
        if (endpoint.tag) tags.add(endpoint.tag);
        reportSchemaIssues(endpoint, warnings);
    }
    return {
        openapi: irToOpenApi(spec),
        warnings,
        statistics: { endpoints: spec.endpoints.length, methods, tags: tags.size },
    };
}

/*
 * Example-derived schemas can contain positions the examples did not reveal
 * (null values, empty arrays) and placeholder objects such as { "...": "..." }.
 * Both are dropped from the OpenAPI output, so they are reported here.
 * Multipart fields are exempt: their types are genuinely unknowable from documentation.
 */
function reportSchemaIssues(endpoint, warnings) {
    const key = endpointKey(endpoint.method.value, endpoint.path);
    const schemas = [];
    if (endpoint.request.body && endpoint.request.body.value.contentType.includes("json")) {
        schemas.push(["request body", endpoint.request.body.value.schema, endpoint.request.body.source.lines]);
    }
    for (const response of endpoint.responses) {
        if (response.body && response.body.value.contentType.includes("json")) {
            schemas.push([`response ${response.status.value}`, response.body.value.schema, response.body.source.lines]);
        }
    }
    for (const [what, schema, lines] of schemas) {
        const issues = collectSchemaIssues(schema);
        if (issues.unknownTypes.length > 0) {
            warnings.push({
                code: "UNKNOWN_TYPE",
                endpoint: key,
                message: `The type of ${what} ${listPaths(issues.unknownTypes)} could not be determined from the documented example; typed as string`,
                ...(lines ? { lines } : {})
            });
        }
        if (issues.placeholders.length > 0) {
            warnings.push({
                code: "PLACEHOLDER_EXAMPLE",
                endpoint: key,
                message: `The example for ${what} ${listPaths(issues.placeholders)} is a placeholder ({ "...": "..." }); its properties are not documented`,
                ...(lines ? { lines } : {})
            });
        }
    }
}

/* "a", "a and b", or "a, b and 3 more" for longer lists. */
function listPaths(paths) {
    const shown = paths.slice(0, 3).map((path) => `"${path}"`);
    const rest = paths.length - shown.length;
    return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ");
}
