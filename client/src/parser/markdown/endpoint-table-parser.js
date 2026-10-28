/*
 * Stage 3: endpoint tables.
 *
 * Endpoint table:   Method | Endpoint | Permission or Auth | Description?
 * Reference table:  Entity | List (GET) | Single (GET) | Create / Update (POST) | Remove (POST/DELETE) | Permission
 * Any other table (rate limits, field lists) is ignored.
 */
import { addParams, addResponse, documentedHeaderParams, documentedResponse, errorResponse, mentionedParams, parseMultipart, parsePermissionCell, parseShorthand, requiredQueryMentions, shorthandSpan, statusMentions, templateParams } from "./endpoint-details.js";
import { normalizeTableHeader } from "./document-parser.js";
import { codeSpans, firstSentence, stripInline } from "./inline.js";
import { breadcrumb, cleanTitle, parseMethodList, resolvePath, topSection } from "./section-parser.js";
export function parseTables(section, ctx) {
    for (const block of section.blocks) {
        if (block.kind !== "table")
            continue;
        const header = block.header.map(normalizeTableHeader);
        if (header.includes("method") && header.includes("endpoint")) {
            parseEndpointTable(block, header, section, ctx);
        }
        else if (header.includes("entity") && header.some((h) => headerMethods(h).length > 0)) {
            parseReferenceTable(block, header, section, ctx);
        }
    }
}
function parseEndpointTable(table, header, section, ctx) {
    const col = (name) => header.indexOf(name);
    const methodCol = col("method");
    const endpointCol = col("endpoint");
    const permissionCol = col("permission");
    const authCol = col("auth");
    const descriptionCol = col("description");
    for (const row of table.rows) {
        const lines = [row.line, row.line];
        const methods = parseMethodList(stripInline(row.cells[methodCol] ?? ""));
        const endpointCell = row.cells[endpointCol] ?? "";
        const target = codeSpans(endpointCell)[0]?.code ?? stripInline(endpointCell);
        if (methods.length === 0 || !target) {
            ctx.warn("INVALID_TABLE_ROW", `Row is not an endpoint: ${stripInline(row.cells.join(" | "))}`, { lines });
            continue;
        }
        const resolved = resolvePath(target, section);
        const description = descriptionCol === -1 ? "" : row.cells[descriptionCol] ?? "";
        const authCell = authCol === -1 ? "" : row.cells[authCol] ?? "";
        const authInCell = parseAuthValue(authCell);
        const permissionCell = permissionCol !== -1
            ? row.cells[permissionCol] ?? ""
            : authCol !== -1 && authInCell === undefined ? authCell : "";
        for (const method of methods) {
            const endpoint = createDraft({
                method,
                path: resolved.path,
                section,
                origin: "table",
                lines,
                description: stripAuthDirective(stripInline(description))
            });
            endpoint.noteTable = table;
            if (permissionCell || authInCell === undefined) applyPermissionCell(endpoint, permissionCell, lines, ctx);
            if (authInCell !== undefined) {
                endpoint.security = { value: authInCell ? "bearer" : "public", source: { kind: "explicit", lines } };
            }
            addParams(endpoint, templateParams(resolved.query, lines));
            applyDescription(endpoint, description, lines, ctx);
            const rowShorthand = shorthandAfterTarget(endpointCell);
            if (rowShorthand)
                setShorthandBody(endpoint, rowShorthand, lines, ctx);
            checkResolution(endpoint, resolved.unresolved, section, ctx);
            ctx.endpoints.push(endpoint);
        }
    }
}
function parseReferenceTable(table, header, section, ctx) {
    const entityCol = header.indexOf("entity");
    const permissionCol = header.indexOf("permission");
    const authCol = header.indexOf("auth");
    ctx.warn("INFERRED_PERMISSION", `Reference table "${section.title}": per-endpoint permissions inferred from column names (List/Single -> view, Create -> add, Update -> edit, Remove -> delete)`, { lines: table.lines });
    for (const row of table.rows) {
        const lines = [row.line, row.line];
        const entity = stripInline(row.cells[entityCol] ?? "");
        const permissions = permissionCol === -1 ? [] : parsePermissionCell(row.cells[permissionCol] ?? "").codes;
        const auth = authCol === -1 ? undefined : parseAuthValue(row.cells[authCol] ?? "");
        header.forEach((columnName, index) => {
            const methods = headerMethods(columnName);
            const target = codeSpans(row.cells[index] ?? "")[0]?.code;
            if (methods.length === 0 || !target)
                return;
            const resolved = resolvePath(target, section);
            const actions = columnActions(columnName);
            const columnPermissions = permissions.filter((code) => actions.includes(code.split(":")[1]));
            for (const method of methods) {
                const endpoint = createDraft({
                    method,
                    path: resolved.path,
                    section,
                    origin: "reference",
                    lines,
                    description: `${entity}: ${stripInline(table.header[index]).replace(/\s*\([^)]*\)/, "")}`
                });
                endpoint.entity = entity;
                endpoint.noteTable = table;
                endpoint.permissions =
                    columnPermissions.length > 0
                        ? { value: columnPermissions, source: { kind: "inferred", lines } }
                        : { value: [], source: { kind: "defaulted", lines } };
                if (auth !== undefined) {
                    endpoint.security = { value: auth ? "bearer" : "public", source: { kind: "explicit", lines } };
                }
                if (columnPermissions.length === 0) {
                    ctx.warn("MISSING_PERMISSION", "No permission documented", { endpoint, lines });
                }
                addParams(endpoint, templateParams(resolved.query, lines));
                checkResolution(endpoint, resolved.unresolved, section, ctx);
                ctx.endpoints.push(endpoint);
            }
        });
    }
}
/* "List (GET)" -> [GET]; "Remove (POST/DELETE)" -> [POST, DELETE] */
function headerMethods(columnName) {
    const match = columnName.match(/\(([a-z/ ]+)\)\s*$/i);
    return match ? parseMethodList(match[1].toUpperCase()) : [];
}
function columnActions(columnName) {
    const actions = [];
    if (/\b(list|single)\b/.test(columnName))
        actions.push("view");
    if (/\bcreate\b/.test(columnName))
        actions.push("add");
    if (/\bupdate\b/.test(columnName))
        actions.push("edit");
    if (/\b(remove|delete)\b/.test(columnName))
        actions.push("delete");
    return actions;
}
export function createDraft(options) {
    const description = options.description?.trim() || undefined;
    return {
        method: {
            value: options.method,
            source: { kind: options.methodSource ?? "explicit", lines: options.lines }
        },
        path: options.path,
        section: breadcrumb(options.section),
        tag: cleanTitle(topSection(options.section).heading?.text ?? "") || undefined,
        ...(description ? { summary: firstSentence(description), description } : {}),
        security: { value: "bearer", source: { kind: "defaulted" } },
        permissions: { value: [], source: { kind: "defaulted" } },
        request: { parameters: [] },
        responses: [],
        sourceLines: [...options.lines],
        declaredIn: options.section,
        origin: options.origin,
        detailSections: []
    };
}
export function applyPermissionCell(endpoint, cell, lines, ctx) {
    const parsed = parsePermissionCell(cell);
    if (parsed.bearer) {
        endpoint.security = { value: "bearer", source: { kind: "explicit", lines } };
    }
    if (parsed.leftover) {
        /* Keep the raw text rather than losing it, but flag that it is not a permission code. */
        ctx.warn("INVALID_PERMISSION", `Permission cell "${stripInline(cell)}" is not a permission code (expected resource:action); kept as documented`, { endpoint, lines });
        parsed.codes.push(parsed.leftover);
    }
    if (parsed.codes.length > 0) {
        endpoint.permissions = { value: parsed.codes, source: { kind: "explicit", lines } };
        if (parsed.anyOf) endpoint.permissionsAnyOf = { value: parsed.anyOf, source: { kind: "explicit", lines } };
    }
    else if (parsed.bearer) {
        /* "Bearer" alone: authenticated, no module permission. */
        endpoint.permissions = { value: [], source: { kind: "explicit", lines } };
    }
    else {
        ctx.warn("MISSING_PERMISSION", "Permission cell is empty", { endpoint, lines });
    }
}
/*
 * Facts in a description cell: filter params, required params, status codes,
 * shorthand bodies, multipart fields.
 */
export function applyDescription(endpoint, text, lines, ctx) {
    const auth = text.match(/\bAuth\s*:\s*(true|false)\b/i);
    if (auth) {
        endpoint.security = { value: auth[1].toLowerCase() === "true" ? "bearer" : "public", source: { kind: "explicit", lines } };
    }
    addParams(endpoint, mentionedParams(text, lines));
    if (/^Paginated\b/i.test(stripInline(text))) {
        addParams(endpoint, ctx.paginationParams);
    }

    for (const name of requiredQueryMentions(text)) {
        const param = endpoint.request.parameters.find((p) => p.name === name && p.in === "query");
        if (param) {
            param.required = { value: true, source: { kind: "explicit", lines } };
        }
        else {
            addParams(endpoint, [
                {
                    name,
                    in: "query",
                    required: { value: true, source: { kind: "explicit", lines } },
                    schema: { type: "string", typeUnknown: true }
                }
            ]);
        }
    }
    for (const mention of statusMentions(text)) {
        if (mention.status >= 300) {
            addResponse(endpoint, errorResponse(ctx, mention.status, mention.description, lines));
        }
    }
    const multipart = parseMultipart(text);
    if (multipart) {
        setBody(endpoint, "multipart/form-data", multipart, undefined, lines, ctx);
        return;
    }
    const shorthand = shorthandSpan(text);
    if (shorthand)
        setShorthandBody(endpoint, shorthand, lines, ctx);
}
export function applyDocumentedFacts(endpoint) {
    if (!endpoint.description) return;
    const lines = endpoint.sourceLines;
    addParams(endpoint, documentedHeaderParams(endpoint.description, lines));
    const response = documentedResponse(endpoint.description, lines);
    if (response) addResponse(endpoint, response);
}
function parseAuthValue(text) {
    const normalized = stripInline(text).trim();
    const match = normalized.match(/^(?:Auth\s*:\s*)?(true|false)$/i);
    return match ? match[1].toLowerCase() === "true" : undefined;
}
function stripAuthDirective(text) {
    return text.replace(/\bAuth\s*:\s*(?:true|false)\b[.!]?/gi, "").replace(/\s{2,}/g, " ").trim();
}
/* "`modify/completeTask.php` — `{task_id}`" */
function shorthandAfterTarget(cell) {
    const spans = codeSpans(cell);
    return spans.slice(1).map((s) => s.code.trim()).find((c) => /^\{[\s\S]*\}$/.test(c));
}
export function setShorthandBody(endpoint, shorthand, lines, ctx) {
    const schema = parseShorthand(shorthand, { markRequired: true });
    if (!schema) {
        ctx.warn("UNPARSED_BODY_REFERENCE", `Could not read body shorthand ${shorthand}`, { endpoint, lines });
        return;
    }
    setBody(endpoint, "application/json", schema, undefined, lines, ctx);
}
export function setBody(endpoint, contentType, schema, example, lines, ctx, kind = "explicit") {
    if (endpoint.method.value === "GET" || endpoint.method.value === "HEAD") {
        ctx.warn("UNBOUND_JSON_BLOCK", `Body documented for ${endpoint.method.value}; ignored`, { endpoint, lines });
        return;
    }
    if (endpoint.request.body) {
        ctx.warn("REQUEST_BODY_OVERRIDDEN", `Request body at lines ${lines[0]}-${lines[1]} replaces the one at lines ${endpoint.request.body.source.lines?.join("-")}`, { endpoint, lines });
    }
    endpoint.request.body = {
        value: { contentType, schema, ...(example !== undefined ? { example } : {}) },
        source: { kind, lines }
    };
}
function checkResolution(endpoint, unresolved, section, ctx) {
    if (unresolved) {
        ctx.warn("UNRESOLVED_PREFIX", `No path prefix found for section "${section.title}"`, { endpoint, lines: endpoint.sourceLines });
        return;
    }
    const candidates = section.prefixCandidates;
    if (candidates && !candidates.some((p) => endpoint.path.startsWith(`/${p}/`))) {
        ctx.warn("UNRESOLVED_PREFIX", `Path does not match any heading prefix (${candidates.join(", ")})`, { endpoint, lines: endpoint.sourceLines });
    }
}
