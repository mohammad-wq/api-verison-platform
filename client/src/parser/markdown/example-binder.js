/*
 * Stage 4: attach prose and JSON examples to the endpoints they describe.
 *
 * Section-level facts:
 *   "No token required."                         -> the endpoint is public
 *   "Every endpoint except `x.php` requires ..." -> (from conventions) x.php is public
 *   "Query params: `case_id` (required), ..."    -> query parameters
 *   "Errors: `409` duplicate ..."                -> error responses
 *
 * JSON blocks are classified by the paragraph right before them:
 *   "Request:", "`insertUpdateRole.php` request:"  -> request body
 *   "Response `data`:", "Success `201`:"           -> success response
 *
 * and bound to an endpoint by, in order: a file name in the label, the detail
 * section the block sits in, or the only write endpoint declared in its section.
 * A block that can not be bound is reported, never guessed.
 */
import { cloneSchema, inferSchema } from "../schema-inference.js";
import { fileName } from "./context.js";
import { addParams, addResponse, errorResponse, queryParamsList, reasonPhrase, statusMentions } from "./endpoint-details.js";
import { setBody } from "./endpoint-table-parser.js";
import { codeSpans, stripInline } from "./inline.js";
import { parseJsonSegments, toPlain } from "./json-block.js";
import { forEachSection, isWithin } from "./section-parser.js";

const NO_TOKEN = /\bno token (?:is )?required\b/i;

export function bindDetails(root, ctx) {
    markPublicEndpoints(ctx);

    forEachSection(root, (section) => {
        let previous;
        for (const block of section.blocks) {
            if (block.kind === "paragraph") {
                bindParagraph(section, block, ctx);
            } else if (block.kind === "fence" && !block.consumed && (block.lang === "json" || block.lang === "")) {
                bindJsonBlock(section, block, previous?.kind === "paragraph" ? previous : undefined, ctx);
            }
            previous = block;
        }
    });
}

/* ---------- public endpoints ---------- */

function markPublicEndpoints(ctx) {
    for (const { target, lines } of ctx.publicTargets) {
        const suffix = `/${target}`;
        const matches = ctx.endpoints.filter((e) => e.path === suffix || e.path.endsWith(suffix));
        if (matches.length === 0) {
            ctx.warn("UNRESOLVED_PREFIX", `Public endpoint "${target}" matches no documented endpoint`, { lines });
        }
        for (const endpoint of matches) makePublic(endpoint, lines);
    }
}

function makePublic(endpoint, lines) {
    endpoint.security = { value: "public", source: { kind: "explicit", lines } };
}

/* ---------- target resolution ---------- */

/* Endpoints documented by the detail section(s) that contain `section`. */
function detailTargets(section, ctx) {
    return ctx.endpoints.filter((e) => e.detailSections.some((detail) => isWithin(section, detail)));
}

/* Endpoints with this file name, searched from the section outwards so the nearest scope wins. */
function endpointsByFile(section, file, ctx) {
    for (let s = section; s; s = s.parent) {
        const matches = ctx.endpoints.filter((e) => fileName(e.path) === file && e.declaredIn && isWithin(e.declaredIn, s));
        if (matches.length > 0) return matches;
    }
    return [];
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);

/* The single create/update endpoint declared directly in this section, if there is exactly one. */
function onlyWriteEndpoint(section, ctx) {
    const writes = ctx.endpoints.filter((e) => e.declaredIn === section && WRITE_METHODS.has(e.method.value));
    if (writes.length === 1) return writes[0];
    /* Several writes (create/update plus remove...): the example belongs to the one that creates or updates. */
    const saving = writes.filter((e) => /^(insertUpdate|insert|update|add|create|save|set)/i.test(fileName(e.path)));
    return saving.length === 1 ? saving[0] : undefined;
}

function filesNamedIn(text) {
    return codeSpans(text)
        .map((span) => span.code.replace(/\?.*$/, "").split("/").pop())
        .filter((name) => /\.php$/i.test(name));
}

/* ---------- paragraphs ---------- */

function bindParagraph(section, block, ctx) {
    /* "Remove errors: `409` if ..." under a table describes that section's remove endpoints. */
    const removeLine = block.text.split("\n").find((line) => /^Remove errors?\b/i.test(line.trim()));
    if (removeLine) {
        const removals = ctx.endpoints.filter((e) => e.declaredIn === section && /^remove/i.test(fileName(e.path)));
        for (const mention of statusMentions(removeLine)) {
            if (mention.status < 300) continue;
            for (const endpoint of removals) addResponse(endpoint, errorResponse(ctx, mention.status, mention.description, block.lines));
        }
    }
    const targets = detailTargets(section, ctx);
    if (targets.length === 0) return;

    if (NO_TOKEN.test(block.text)) {
        for (const endpoint of targets) makePublic(endpoint, block.lines);
    }
    const auth = block.text.match(/\bAuth\s*:\s*(true|false)\b/i);
    if (auth) {
        for (const endpoint of targets) {
            endpoint.security = {
                value: auth[1].toLowerCase() === "true" ? "bearer" : "public",
                source: { kind: "explicit", lines: block.lines }
            };
        }
    }
    const params = queryParamsList(block.text, block.lines);
    if (params.length > 0) {
        for (const endpoint of targets) addParams(endpoint, params);
    }
    if (/^(?:Remove )?Errors?\b/i.test(block.text.trim())) {
        for (const mention of statusMentions(block.text)) {
            if (mention.status < 300) continue;
            for (const endpoint of targets) addResponse(endpoint, errorResponse(ctx, mention.status, mention.description, block.lines));
        }
    }
}

/* ---------- JSON blocks ---------- */

function classify(label) {
    const text = label ? stripInline(label.text) : "";
    if (/\b(response|success)\b/i.test(text)) {
        const status = label.text.match(/(?:success|response)[^`\n]*`(\d{3})`/i)?.[1] ?? text.match(/\b(?:success|response)\s+(\d{3})\b/i)?.[1];
        return { kind: "response", status: status ? Number(status) : undefined, wrapped: /`data`/i.test(label.text) };
    }
    if (/\brequest\b/i.test(text)) return { kind: "request" };
    return { kind: "unknown" };
}

function bindJsonBlock(section, block, label, ctx) {
    let segments;
    try {
        segments = parseJsonSegments(block.content);
    } catch (error) {
        if (block.lang === "json") ctx.warn("INVALID_JSON_BLOCK", `JSON example could not be read: ${error.message}`, { lines: block.lines });
        return;
    }
    if (segments.length === 0) return;

    /* "// Modules" / "// Disbursement Types": one example per entity, bound by the entity's name. */
    if (segments.length > 1 && segments.every((s) => s.label)) {
        for (const segment of segments) bindEntitySegment(section, segment, block, ctx);
        return;
    }

    const { kind, status, wrapped } = classify(label);
    const node = segments[0].node;
    if (kind === "unknown") {
        const detail = detailTargets(section, ctx).filter((e) => WRITE_METHODS.has(e.method.value) && !e.request.body);
        if (detail.length > 0 && detail.length === detailTargets(section, ctx).length) {
            for (const endpoint of detail) {
                ctx.warn("INFERRED_REQUEST_BINDING", "Unlabelled JSON example in a write endpoint's section taken as its request body", { endpoint, lines: block.lines });
                setBody(endpoint, "application/json", inferSchema(node), toPlain(node), block.lines, ctx);
            }
            return;
        }
        ctx.warn("UNBOUND_JSON_BLOCK", "JSON example has no \"Request\" or \"Response\" label; not bound", { lines: block.lines });
        return;
    }

    const targets = resolveTargets(section, label, kind, ctx);
    if (targets.length === 0) {
        ctx.warn("UNBOUND_JSON_BLOCK", `${kind === "request" ? "Request" : "Response"} example could not be matched to an endpoint; not bound`, { lines: block.lines });
        return;
    }

    for (const endpoint of targets) {
        if (kind === "request") {
            if (!WRITE_METHODS.has(endpoint.method.value) && endpoint.method.value !== "DELETE") continue;
            setBody(endpoint, "application/json", inferSchema(node), toPlain(node), block.lines, ctx);
        } else {
            addResponse(endpoint, successResponse(node, status, wrapped, block.lines, ctx));
        }
    }
}

function resolveTargets(section, label, kind, ctx) {
    const files = label ? filesNamedIn(label.text) : [];
    if (files.length > 0) {
        /* "`insertTask.php` / `createFollowUpTask.php` request:" documents the first; the rest are reported. */
        const [first, ...rest] = files;
        for (const file of rest) {
            ctx.warn("INFERRED_REQUEST_BINDING", `Example is labelled for several files; bound to ${first} only, not ${file}`, { lines: label.lines });
        }
        return endpointsByFile(section, first, ctx);
    }
    const detail = detailTargets(section, ctx);
    if (detail.length > 0) return detail;
    if (kind === "request") {
        const only = onlyWriteEndpoint(section, ctx);
        if (only) {
            ctx.warn("INFERRED_REQUEST_BINDING", "Request example bound to the only create/update endpoint in its section", { endpoint: only, lines: label?.lines });
            return [only];
        }
    }
    return [];
}

const stem = (text) =>
    text
        .toLowerCase()
        .replace(/\s*\(.*$/, "")
        .trim()
        .replace(/ies$/, "y")
        .replace(/(?<!s)s$/, "");

function bindEntitySegment(section, segment, block, ctx) {
    const name = stem(segment.label);
    const candidates = ctx.endpoints.filter((e) => {
        if (!e.entity || !/^insertUpdate/i.test(fileName(e.path)) || !e.declaredIn) return false;
        const entity = stem(e.entity);
        return entity.startsWith(name) || name.startsWith(entity);
    });
    const inScope = candidates.filter((e) => isWithin(e.declaredIn, section.parent ?? section) || isWithin(section, e.declaredIn));
    const targets = inScope.length > 0 ? inScope : candidates;
    if (targets.length === 0) {
        ctx.warn("UNBOUND_JSON_BLOCK", `Example "${segment.label}" matches no entity; not bound`, { lines: block.lines });
        return;
    }
    for (const endpoint of targets) {
        setBody(endpoint, "application/json", inferSchema(segment.node), toPlain(segment.node), block.lines, ctx);
    }
}

/*
 * A response example is either the whole envelope ({ "statusCode": ..., "data": ... })
 * or, when labelled "Response `data`", just the `data` part.
 */
function successResponse(node, status, wrapped, lines, ctx) {
    const isEnvelope = node.t === "object" && node.entries.some(([key]) => key === "statusCode");
    const plain = toPlain(node);
    let schema;
    let example = plain;

    if (isEnvelope || !ctx.envelope) {
        schema = inferSchema(node);
    } else {
        schema = cloneSchema(ctx.envelope);
        schema.properties = { ...schema.properties, data: inferSchema(node) };
        example = { ...(ctx.envelopeExample ?? {}), data: plain };
        void wrapped;
    }

    const documented = isEnvelope ? node.entries.find(([key]) => key === "statusCode")?.[1]?.v : undefined;
    const code = status ?? (Number.isInteger(documented) ? documented : "2XX");
    const known = typeof code === "number";
    return {
        status: { value: code, source: { kind: known ? "explicit" : "defaulted", lines } },
        description: reasonPhrase(code),
        body: { value: { contentType: "application/json", schema, example }, source: { kind: "explicit", lines } },
    };
}
