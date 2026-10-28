/*
 * Orchestrates the Markdown stages and produces the IR.
 */
import { ParseContext } from "./context.js";
import { parseConventions } from "./conventions.js";
import { bindDetails } from "./example-binder.js";
import { parseDocument } from "./document-parser.js";
import { parseHeadingEndpoints, parseProseEndpoints } from "./endpoint-heading-parser.js";
import { applyDocumentedFacts, parseTables } from "./endpoint-table-parser.js";
import { addParams, addResponse } from "./endpoint-details.js";
import { stripInline } from "./inline.js";
import { attachNotes, mergeNotes } from "./table-notes.js";
import { buildSections, forEachSection } from "./section-parser.js";
import { endpointKey } from "../ir/types.js";
export function markdownToIr(markdown) {
    const ctx = new ParseContext();
    const blocks = parseDocument(markdown);
    const root = buildSections(blocks, ctx.warnings);
    parseConventions(root, ctx);
    forEachSection(root, (section) => parseTables(section, ctx));
    parseHeadingEndpoints(root, ctx);
    parseProseEndpoints(root, ctx);
    bindDetails(root, ctx);
    attachNotes(root, ctx);
    mergeNotes(ctx.endpoints);
    for (const endpoint of ctx.endpoints) applyDocumentedFacts(endpoint);
    const merged = mergeDuplicateEndpoints(ctx);
    const endpoints = merged.map(({ declaredIn: _d, origin: _o, entity: _e, detailSections: _s, noteTable: _t, notes: _n, ...endpoint }) => endpoint);
    const { title, description } = documentHeader(root);
    return {
        spec: {
            title,
            version: { value: "1.0.0", source: { kind: "defaulted" } },
            ...(description ? { description } : {}),
            ...(ctx.servers.length > 0 ? { servers: ctx.servers } : {}),
            endpoints
        },
        warnings: ctx.warnings
    };
}
/*
 * The same METHOD + path declared twice (a repeated table row, a heading that did not merge
 * into its row, an alias that matches an existing endpoint) is merged into the first
 * declaration instead of silently overwriting it in the OpenAPI output. Everything each
 * declaration documented is kept: parameters, responses, permissions and detail sections.
 */
function mergeDuplicateEndpoints(ctx) {
    const byKey = new Map();
    const result = [];
    for (const endpoint of ctx.endpoints) {
        const key = endpointKey(endpoint.method.value, endpoint.path);
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, endpoint);
            result.push(endpoint);
            continue;
        }
        ctx.warn("DUPLICATE_ENDPOINT", `Endpoint ${key} is documented more than once (also at lines ${existing.sourceLines.join("-")}); the declarations were merged`, { endpoint, lines: endpoint.sourceLines });
        for (const param of endpoint.request.parameters) addParams(existing, [param]);
        if (endpoint.request.body) {
            if (existing.request.body) {
                ctx.warn("REQUEST_BODY_OVERRIDDEN", `Duplicate declaration at lines ${endpoint.sourceLines.join("-")} replaces the request body documented at lines ${existing.request.body.source.lines?.join("-")}`, { endpoint, lines: endpoint.sourceLines });
            }
            existing.request.body = endpoint.request.body;
        }
        for (const response of endpoint.responses) addResponse(existing, response);
        if (endpoint.security.source.kind === "explicit") existing.security = endpoint.security;
        if (endpoint.permissions.value.length > 0 && existing.permissions.source.kind !== "explicit") existing.permissions = endpoint.permissions;
        if (!existing.summary && endpoint.summary) {
            existing.summary = endpoint.summary;
            existing.description = endpoint.description;
        }
        else if (endpoint.description && !existing.description?.includes(endpoint.description)) {
            existing.description = [existing.description, endpoint.description].filter(Boolean).join("\n\n");
        }
        existing.detailSections.push(...endpoint.detailSections);
        existing.sourceLines = [Math.min(existing.sourceLines[0], endpoint.sourceLines[0]), Math.max(existing.sourceLines[1], endpoint.sourceLines[1])];
    }
    return result;
}
function documentHeader(root) {
    const top = root.children.find((section) => section.level === 1);
    if (!top)
        return { title: "Untitled API" };
    const paragraph = top.blocks.find((block) => block.kind === "paragraph");
    return {
        title: stripInline(top.heading?.text ?? "Untitled API"),
        ...(paragraph && paragraph.kind === "paragraph"
            ? { description: stripInline(paragraph.text) }
            : {})
    };
}
