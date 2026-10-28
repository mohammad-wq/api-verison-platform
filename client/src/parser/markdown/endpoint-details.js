/*
 * Extractors for facts written inline in table cells and paragraphs:
 * query parameters, status-code mentions, shorthand bodies, multipart
 * fields and permission codes.
 */
import { cloneSchema, inferSchema, unknownSchema } from "../schema-inference.js";
import { IDENTIFIER, codeSpans, stripInline } from "./inline.js";
import { tryParseJsonValue } from "./json-block.js";
/* ---------- query parameters ---------- */
/* Template from the endpoint itself: "getRole.php?role_id=1" -> required role_id. */
export function templateParams(query, lines) {
    if (!query)
        return [];
    return query
        .split("&")
        .map((pair) => pair.split("="))
        .filter(([name]) => name && IDENTIFIER.test(name))
        .map(([name, value = ""]) => ({
        name,
        in: "query",
        required: { value: true, source: { kind: "explicit", lines } },
        schema: schemaFromQueryValue(value),
        ...(value && !/^\{.*\}$/.test(value) ? { example: exampleFromQueryValue(value) } : {})
    }));
}
/*
 * Mentions such as "`?search=` matches name", "`?counselor_status=pending|approved`",
 * "`?page=` (default 1)". These are documented as filters, so not required.
 */
export function mentionedParams(text, lines) {
    const params = [];
    for (const span of codeSpans(text)) {
        for (const piece of span.code.split(/&(?=[A-Za-z_])/)) {
            const match = piece.match(/^\??([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (!match || (!span.code.startsWith("?") && piece === span.code))
                continue;
            const [, name, value] = match;
            const details = text.slice(span.end).match(/^\s*\(([^)]*)\)/);
            const schema = schemaFromQueryValue(value);
            if (details)
                applyParamDetails(schema, details[1]);
            params.push({
                name,
                in: "query",
                required: { value: false, source: { kind: "defaulted", lines } },
                schema
            });
        }
    }
    return params;
}
/* Header declarations and common prose such as "include an `Idempotency-Key` header". */
export function documentedHeaderParams(text, lines) {
    const params = new Map();
    const add = (name, details = "", sentence = "") => {
        if (!/^[A-Za-z0-9-]+$/.test(name)) return;
        const required = !/\b(?:optional|not required)\b/i.test(details) &&
            (/\b(?:required|must|require|requires|include)\b/i.test(details) ||
                /\b(?:must|required|require|requires|include)\b/i.test(sentence));
        params.set(name.toLowerCase(), {
            name,
            in: "header",
            required: { value: required, source: { kind: required ? "explicit" : "defaulted", lines } },
            schema: unknownSchema(),
            ...(details && !/\b(?:required|optional)\b/i.test(details) ? { description: details.trim() } : {})
        });
    };

    for (const line of text.split(/\r?\n/)) {
        const directive = line.match(/^\s*(?:header(?:\s+params?)?|headers)\s*:\s*(.+)$/i);
        if (!directive) continue;
        const declaration = directive[1];
        const headerPattern = /`([A-Za-z0-9-]+)`(?:\s*\(([^)]*)\))?|(?<![\w`])([A-Za-z][A-Za-z0-9-]*-[A-Za-z0-9-]+)(?:\s*\(([^)]*)\))?/g;
        let match;
        while ((match = headerPattern.exec(declaration)) !== null) {
            const details = match[2] ?? match[4] ?? "";
            add(match[1] ?? match[3], details);
        }
    }

    const prosePattern = /`([A-Za-z0-9-]+)`\s+header\b|(?<![\w`])([A-Za-z][A-Za-z0-9-]*-[A-Za-z0-9-]+)\s+header\b/gi;
    let match;
    while ((match = prosePattern.exec(text)) !== null) {
        const start = Math.max(text.lastIndexOf(".", match.index), text.lastIndexOf("\n", match.index), text.lastIndexOf(";", match.index)) + 1;
        const sentence = text.slice(start, prosePattern.lastIndex);
        add(match[1] ?? match[2], "", sentence);
    }
    const idempotencyPattern = /\bIdempotency-Key\b/gi;
    while ((match = idempotencyPattern.exec(text)) !== null) {
        const start = Math.max(text.lastIndexOf(".", match.index), text.lastIndexOf("\n", match.index), text.lastIndexOf(";", match.index)) + 1;
        add("Idempotency-Key", "", text.slice(start, idempotencyPattern.lastIndex));
    }
    return [...params.values()];
}

/* "Response: text/csv" and "Response: application/pdf (binary)" declare success media. */
export function documentedResponse(text, lines) {
    const match = text.match(/\bResponse(?:\s+(\d{3}))?\s*:\s*([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:\s*\((binary|file)\))?/i);
    if (!match) return undefined;
    const contentType = match[2].toLowerCase();
    const binary = Boolean(match[3]) || /^(?:application\/(?:octet-stream|pdf|zip)|image\/|audio\/|video\/)/i.test(contentType);
    return {
        status: { value: match[1] ? Number(match[1]) : "2XX", source: { kind: "explicit", lines } },
        description: `Response content type ${contentType}`,
        body: {
            value: {
                contentType,
                schema: binary ? { type: "string", format: "binary" } : { type: "string" }
            },
            source: { kind: "explicit", lines }
        }
    };
}
/*
 * "Query params: `case_id` (required), `page`, `sort` (`a`, `b`; default `a`), `order` (default `asc`)."
 */
export function queryParamsList(text, lines) {
    const start = text.search(/Query params:/i);
    if (start === -1)
        return [];
    const body = text.slice(start).replace(/^Query params:\s*/i, "");
    const params = [];
    let i = 0;
    while (i < body.length) {
        const char = body[i];
        if (char === "\n" && body[i + 1] === "\n")
            break;
        if (char === "`") {
            const close = body.indexOf("`", i + 1);
            if (close === -1)
                break;
            const name = body.slice(i + 1, close);
            i = close + 1;
            const rest = body.slice(i);
            const details = rest.match(/^\s*\(/) ? readParenthesized(rest) : undefined;
            if (details !== undefined) {
                i += rest.indexOf("(") + details.length + 2;
            }
            if (!IDENTIFIER.test(name))
                continue;
            const required = details !== undefined && /\brequired\b/i.test(details);
            const schema = unknownSchema();
            if (details)
                applyParamDetails(schema, details);
            params.push({
                name,
                in: "query",
                required: {
                    value: required,
                    source: { kind: required ? "explicit" : "defaulted", lines }
                },
                schema
            });
            continue;
        }
        if (char === ".")
            break;
        i++;
    }
    return params;
}
function readParenthesized(text) {
    const open = text.indexOf("(");
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === "(")
            depth++;
        if (text[i] === ")" && --depth === 0)
            return text.slice(open + 1, i);
    }
    return undefined;
}
/* "(default 100, max 500)", "(`a`, `b`; default `a`)" */
function applyParamDetails(schema, details) {
    const defaultMatch = details.match(/default\s+(`[^`]+`|[\w.-]+)/i);
    const maxMatch = details.match(/\bmax\s+(\d+)/i);
    const beforeDefault = details.split(/;|\bdefault\b/i)[0];
    const values = codeSpans(beforeDefault)
        .map((span) => span.code)
        .filter((code) => IDENTIFIER.test(code));
    if (values.length > 1) {
        schema.type = "string";
        schema.enum = values;
        delete schema.typeUnknown;
    }
    if (defaultMatch) {
        const raw = defaultMatch[1].replace(/`/g, "");
        if (/^-?\d+$/.test(raw)) {
            if (schema.typeUnknown || schema.type === "integer") {
                schema.type = "integer";
                delete schema.typeUnknown;
            }
            schema.default = schema.type === "integer" ? Number(raw) : raw;
        }
        else if (!/\s/.test(raw)) {
            schema.default = raw;
        }
    }
    if (maxMatch && schema.type === "integer")
        schema.maximum = Number(maxMatch[1]);
}
function schemaFromQueryValue(value) {
    const trimmed = value.trim();
    if (trimmed.includes("|")) {
        const values = trimmed.split("|").map((v) => v.trim()).filter(Boolean);
        return values.every((v) => /^-?\d+$/.test(v))
            ? { type: "integer", enum: values.map(Number) }
            : { type: "string", enum: values };
    }
    if (/^-?\d+$/.test(trimmed))
        return { type: "integer" };
    if (trimmed === "YYYY-MM-DD")
        return { type: "string", format: "date" };
    if (trimmed === "" || /^\{.*\}$/.test(trimmed) || /^<.*>$/.test(trimmed)) {
        return unknownSchema();
    }
    return { type: "string" };
}
function exampleFromQueryValue(value) {
    return /^-?\d+$/.test(value) ? Number(value) : value;
}
/* Adds params, merging with an existing one of the same name and location. */
export function addParams(endpoint, params) {
    for (const param of params) {
        const existing = endpoint.request.parameters.find((p) => p.name === param.name && p.in === param.in);
        if (!existing) {
            endpoint.request.parameters.push(structuredClone(param));
            continue;
        }
        if (param.required.value && !existing.required.value) {
            existing.required = param.required;
        }
        /* A known type wins over an unknown one; constraints from both are kept. */
        existing.schema =
            existing.schema.typeUnknown && !param.schema.typeUnknown
                ? { ...param.schema, ...pickDefined(existing.schema) }
                : { ...pickDefined(param.schema), ...existing.schema };
        if (existing.example === undefined && param.example !== undefined) {
            existing.example = param.example;
        }
    }
}
function pickDefined(schema) {
    const result = {};
    for (const key of ["enum", "default", "maximum", "format"]) {
        if (schema[key] !== undefined) {
            result[key] = schema[key];
        }
    }
    return result;
}
/* "**requires** `case_id`" in a description makes that query parameter required. */
export function requiredQueryMentions(text) {
    const names = [];
    const pattern = /\brequires\*{0,2}\s+`([A-Za-z_][A-Za-z0-9_]*)`/gi;
    let match;
    while ((match = pattern.exec(text)) !== null)
        names.push(match[1]);
    return names;
}
/*
 * Status codes mentioned in a description cell or an "Errors:" clause:
 *   "`409` duplicate code", "409 if in use by a case", "`409 "Already assigned."` if already active"
 */
export function statusMentions(text) {
    const pattern = /`(\d{3})(?:\s+([^`]*))?`|\b([1-5]\d{2})(?=\s+(?:if|when|for|on)\b)/g;
    const found = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
        const status = Number(match[1] ?? match[3]);
        if (status < 100 || status > 599)
            continue;
        found.push({
            status,
            inline: match[2],
            start: match.index,
            end: match.index + match[0].length
        });
    }
    return found.map((item, index) => {
        const next = found[index + 1]?.start ?? text.length;
        const tail = text
            .slice(item.end, next)
            .split(/[;)]|\.\s|\.$|\n|,\s*(?=`\d{3})/)[0];
        const description = stripInline([item.inline, tail].filter(Boolean).join(" "))
            .replace(/^[\s,:—-]+|[\s,:;—-]+$/g, "");
        /* The split above can cut a parenthetical in half; close it. */
        const unclosed = (description.match(/\(/g) ?? []).length - (description.match(/\)/g) ?? []).length;
        return { status: item.status, description: unclosed > 0 ? description + ")".repeat(unclosed) : description };
    });
}
export function errorResponse(ctx, status, description, lines) {
    const body = ctx.envelope ? cloneSchema(ctx.envelope) : undefined;
    if (body?.properties?.data) {
        body.properties.data = { type: "object", nullable: true };
    }
    return {
        status: { value: status, source: { kind: "explicit", lines } },
        description: description || reasonPhrase(status),
        ...(body
            ? {
                body: {
                    value: { contentType: "application/json", schema: body },
                    source: { kind: "explicit", lines }
                }
            }
            : {})
    };
}
export function addResponse(endpoint, response) {
    const existing = endpoint.responses.find((r) => r.status.value === response.status.value);
    if (!existing) {
        endpoint.responses.push(response);
        return;
    }
    if (response.description &&
        response.description !== reasonPhrase(response.status.value) &&
        !existing.description.includes(response.description)) {
        existing.description =
            existing.description === reasonPhrase(existing.status.value)
                ? response.description
                : `${existing.description}; ${response.description}`;
    }
    if (!existing.body && response.body)
        existing.body = response.body;
}
export function reasonPhrase(status) {
    const phrases = {
        "200": "OK",
        "201": "Created",
        "202": "Accepted",
        "204": "No Content",
        "2XX": "Success (status code not documented)",
        "400": "Bad Request",
        "401": "Unauthorized",
        "403": "Forbidden",
        "404": "Not Found",
        "405": "Method Not Allowed",
        "409": "Conflict",
        "413": "Payload Too Large",
        "415": "Unsupported Media Type",
        "422": "Unprocessable Entity",
        "429": "Too Many Requests",
        "500": "Internal Server Error",
        "502": "Bad Gateway",
        "503": "Service Unavailable"
    };
    return phrases[String(status)] ?? "Response";
}
/* ---------- shorthand bodies ---------- */
/*
 * "{department_id, user_id, is_head?}", "{department_id, module_ids: [1,3]}",
 * "{counselor_id, counselor_status: "approved"|"rejected"}".
 * Fields without "?" are required when `markRequired` is set (documented convention).
 * Returns undefined when the text is not a field list.
 */
export function parseShorthand(text, options) {
    const inner = text.trim().match(/^\{([\s\S]*)\}$/);
    if (!inner)
        return undefined;
    const json = tryParseJsonValue(text);
    if (json && json.t === "object")
        return inferSchema(json);
    const entries = splitTopLevel(inner[1]);
    const properties = {};
    const required = [];
    for (const entry of entries) {
        const match = entry.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(\?)?\s*(?::\s*(.+))?$/s);
        if (!match)
            return undefined;
        const [, name, optional, value] = match;
        properties[name] = value ? schemaFromShorthandValue(value.trim()) : unknownSchema();
        if (!optional && options.markRequired)
            required.push(name);
    }
    if (Object.keys(properties).length === 0)
        return undefined;
    return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {})
    };
}
function schemaFromShorthandValue(value) {
    const primitive = value.toLowerCase();
    if (["string", "integer", "number", "boolean", "object"].includes(primitive)) {
        return { type: primitive };
    }
    const arrayMatch = value.match(/^(?:array\s*<\s*([A-Za-z]+)\s*>|([A-Za-z]+)\[\])$/i);
    if (arrayMatch) {
        const itemType = (arrayMatch[1] ?? arrayMatch[2]).toLowerCase();
        if (["string", "integer", "number", "boolean", "object"].includes(itemType)) {
            return { type: "array", items: { type: itemType } };
        }
    }
    if (value.includes("|")) {
        const options = value.split("|").map((v) => v.trim());
        if (options.every((v) => /^"[^"]*"$/.test(v))) {
            return { type: "string", enum: options.map((v) => v.slice(1, -1)) };
        }
        if (options.every((v) => v === "true" || v === "false")) {
            return { type: "boolean" };
        }
    }
    const json = tryParseJsonValue(value);
    if (json)
        return inferSchema(json);
    if (/^\[.*\]$/.test(value))
        return { type: "array", items: unknownSchema() };
    return unknownSchema();
}
function splitTopLevel(text) {
    const parts = [];
    let depth = 0;
    let inString = false;
    let current = "";
    for (const char of text) {
        if (char === '"')
            inString = !inString;
        if (!inString && (char === "[" || char === "{"))
            depth++;
        if (!inString && (char === "]" || char === "}"))
            depth--;
        if (char === "," && depth === 0 && !inString) {
            parts.push(current);
            current = "";
        }
        else {
            current += char;
        }
    }
    if (current.trim())
        parts.push(current);
    return parts.filter((part) => part.trim() !== "");
}
/* First code span that is a `{...}` body, e.g. in "`{case_id, archive_reason}`". */
export function shorthandSpan(text) {
    return codeSpans(text)
        .map((span) => span.code.trim())
        .find((code) => /^\{[\s\S]*\}$/.test(code));
}
/* ---------- multipart ---------- */
/*
 * Text between two code spans that can still be part of the multipart field list:
 * separators (", ", "/", "+") and the "file field" phrase. Anything else (a new
 * sentence, a status mention, another directive) ends the clause, so fields from
 * later sentences are never mistaken for multipart fields.
 */
const FIELD_GAP = /^[\s,;:+/|&]*(?:file\s+fields?|and)?[\s,;:+/|&]*$/i;
/* "`multipart/form-data`: `case_id`, `attachment_category_id?`, file field `file`" */
export function parseMultipart(text) {
    const spans = codeSpans(text);
    const index = spans.findIndex((span) => span.code === "multipart/form-data");
    const properties = {};
    const required = [];
    if (index !== -1) {
        let lastEnd = spans[index].end;
        for (const span of spans.slice(index + 1)) {
            if (!FIELD_GAP.test(text.slice(lastEnd, span.start))) break;
            lastEnd = span.end;
            const match = span.code.match(/^([A-Za-z_][A-Za-z0-9_]*)(\?)?$/);
            if (!match) continue;
            addMultipartProperty(properties, required, match[1], Boolean(match[2]), /file field\s*$/i.test(text.slice(0, span.start)));
        }
    } else {
        const match = text.match(/multipart\/form-data\s*:\s*([^.;\n]+)/i);
        if (!match) return undefined;
        for (const token of match[1].split(",")) {
            const field = token.trim().replace(/`/g, "");
            const fieldMatch = field.match(/^(?:(file)\s+field\s+)?([A-Za-z_][A-Za-z0-9_]*)(\?)?$/i);
            if (!fieldMatch) continue;
            addMultipartProperty(properties, required, fieldMatch[2], Boolean(fieldMatch[3]), Boolean(fieldMatch[1]));
        }
    }
    if (Object.keys(properties).length === 0) return undefined;
    return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {})
    };
}
function addMultipartProperty(properties, required, name, optional, isFile) {
    properties[name] = isFile ? { type: "string", format: "binary" } : unknownSchema();
    if (!optional) required.push(name);
}
/*
 * "`roles:add`/`edit`"                       -> roles:add, roles:edit
 * "Bearer + `disbursements:view`"            -> bearer, disbursements:view
 * "`modules:view` / `add` / `edit` / `delete`" -> modules:view, modules:add, ...
 * "systems:view/add/edit/delete" (no backticks) -> systems:view, systems:add, ...
 */
export function parsePermissionCell(text) {
    const codes = [];
    let resource;
    // `a:view` or `a:view_all` is an explicit any-of requirement, not an invalid
    // fragment. Keep it separate from the normal (all-of) permission list.
    const outsideCode = text.replace(/`[^`]*`/g, " ");
    const hasAlternative = /\bor\b/i.test(outsideCode);
    for (const span of codeSpans(text)) {
        const code = span.code.trim();
        const qualified = code.match(/^([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)$/);
        if (qualified) {
            resource = qualified[1];
            codes.push(code);
        }
        else if (resource && /^[A-Za-z0-9_.-]+$/.test(code)) {
            codes.push(`${resource}:${code}`);
        }
        else {
            codes.push(code);
        }
    }
    const leftover = stripInline(text
        .replace(/`[^`]*`/g, "")
        .replace(/\bBearer\b/gi, "")
        .replace(/\bor\b/gi, "")
        .replace(/\((?:create|update)\)/gi, "")
        .replace(/[+/,]/g, " "));
    /* A cell written without code spans, e.g. "systems:view/add", is still a permission list. */
    if (codes.length === 0 && !/`/.test(text) && leftover) {
        const bare = leftover.split(/\s*(?:\band\b)\s*/i).flatMap((token) => token.split(/\s+/)).filter(Boolean);
        if (bare.length > 0 && bare.every((token) => /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/.test(token))) {
            return { codes: bare, bearer: false, leftover: "" };
        }
    }
    return {
        codes,
        bearer: /\bBearer\b/i.test(text),
        leftover,
        ...(hasAlternative && codes.length > 1 ? { anyOf: codes } : {})
    };
}
