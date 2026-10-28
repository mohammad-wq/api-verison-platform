/*
 * Stage 5: prose notes -> operation descriptions.
 *
 * Two places carry notes:
 *   1. paragraphs that directly follow an endpoint (or reference) table in the same section
 *      (up to the next heading, table or fenced block), and
 *   2. paragraphs inside a heading-style endpoint's own section ("### POST `x.php`").
 *
 * Paragraphs that other stages already consume as structured facts (query param lists, error
 * lists, base path, aliases, labels in front of JSON blocks, "No token required") are skipped,
 * so nothing is said twice and nothing is mistaken for a note.
 *
 * Binding for table notes: a note goes to the endpoints it is about when that is provable
 * (it names an endpoint file, or shares a word stem with the verb/name words of the file names
 * that tell the table's rows apart); otherwise it describes the whole table, so it goes to every
 * endpoint of that table.
 */
import { fileName } from "./context.js";
import { codeSpans, stripInline } from "./inline.js";
import { forEachSection } from "./section-parser.js";

/* Paragraph starts that are structured facts handled elsewhere. */
const DIRECTIVE = /^(?:(?:query params?|(?:remove )?errors?|base path|auth)\s*:|accepts\s+`\?)/i;
const ALIAS = /reachable at\s+`[^`]+`\s*\(alias\)/i;
const ALSO_HAS = /^`[^`]+`\s+also has\s+`(?:fetch|modify|remove)\//;
const NO_TOKEN_ONLY = /^no token (?:is )?required\.?$/i;

/* Verb words that say nothing about what an endpoint is about. */
const GENERIC_STEMS = new Set(["get", "fetch", "list", "insert", "modify", "save", "php", "detail", "info", "data", "item", "record", "count"]);
/* "Both require...", "All of these...": a note that quantifies over the table is about the whole table. */
const WHOLE_TABLE = /\b(?:both|either|neither|these|those)\b|\ball (?:of )?(?:them|the endpoints|endpoints)\b/i;

export function attachNotes(root, ctx) {
    forEachSection(root, (section) => {
        attachTableNotes(section, ctx);
        attachSectionNotes(section, ctx);
    });
}

/* ---------- note extraction ---------- */

/* Plain text of a paragraph; list lines keep their own line. Undefined when it is not a note. */
function noteText(block, next) {
    let lines = block.text.split("\n");
    /* A trailing "Request:" / "Response `data`:" line labels the fenced block that follows. */
    if (next?.kind === "fence" && /:\s*$/.test(lines[lines.length - 1].trim())) lines = lines.slice(0, -1);
    if (lines.length === 0) return undefined;
    const first = lines[0].trim();
    if (DIRECTIVE.test(first) || ALIAS.test(lines.join(" ")) || ALSO_HAS.test(first)) return undefined;
    const isList = lines.some((line) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line));
    const text = isList
        ? lines.map((line) => stripInline(line.replace(/^\s*(?:[-*+]\s+)/, "- "))).filter(Boolean).join("\n")
        : stripInline(lines.join("\n"));
    if (!text || NO_TOKEN_ONLY.test(text)) return undefined;
    return text;
}

function addNote(endpoint, text) {
    const parts = [endpoint.description, ...(endpoint.notes ?? [])].filter(Boolean);
    if (parts.some((part) => part.includes(text))) return;
    (endpoint.notes ??= []).push(text);
}

/* ---------- table notes ---------- */

function attachTableNotes(section, ctx) {
    const blocks = section.blocks;
    blocks.forEach((block, index) => {
        if (block.kind !== "table") return;
        const endpoints = ctx.endpoints.filter((e) => e.noteTable === block);
        if (endpoints.length === 0) return;
        for (let i = index + 1; i < blocks.length && blocks[i].kind === "paragraph"; i++) {
            const text = noteText(blocks[i], blocks[i + 1]);
            if (!text) continue;
            for (const endpoint of notedEndpoints(blocks[i].text, text, endpoints)) addNote(endpoint, text);
        }
    });
}

function wordsOf(text) {
    return text
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

function stem(word) {
    let w = word;
    for (const suffix of ["ing", "ed", "es", "s"]) {
        if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
            w = w.slice(0, -suffix.length);
            break;
        }
    }
    return w.replace(/e$/, "");
}

function endpointStems(endpoint) {
    return new Set(wordsOf(fileName(endpoint.path).replace(/\.[a-z0-9]+$/i, "")).map(stem));
}

/* The endpoints of `endpoints` a note is provably about; all of them when that cannot be told. */
function notedEndpoints(raw, text, endpoints) {
    const distinctFiles = new Set(endpoints.map((e) => fileName(e.path)));
    if (distinctFiles.size < 2) return endpoints;

    /* 1. The note names an endpoint file. */
    const named = new Set(
        codeSpans(raw)
            .map((span) => span.code.replace(/\?.*$/, "").split("/").pop())
            .filter((name) => distinctFiles.has(name)),
    );
    if (named.size > 0 && named.size < distinctFiles.size) {
        return endpoints.filter((e) => named.has(fileName(e.path)));
    }

    if (WHOLE_TABLE.test(text)) return endpoints;

    /* 2. The note shares a word stem with what sets some endpoints apart from the others. */
    const stems = endpoints.map(endpointStems);
    const noteStems = new Set(wordsOf(text).filter((w) => w.length >= 4).map(stem));
    const hits = endpoints.filter((_, i) => {
        for (const s of stems[i]) {
            if (GENERIC_STEMS.has(s) || s.length < 3 || !noteStems.has(s)) continue;
            const holders = stems.filter((set) => set.has(s)).length;
            if (holders < endpoints.length && holders > 0 && distinctHolders(endpoints, stems, s) < distinctFiles.size) return true;
        }
        return false;
    });
    return hits.length > 0 && hits.length < endpoints.length ? hits : endpoints;
}

function distinctHolders(endpoints, stems, s) {
    return new Set(endpoints.filter((_, i) => stems[i].has(s)).map((e) => fileName(e.path))).size;
}

/* ---------- heading-style endpoint sections ---------- */

function attachSectionNotes(section, ctx) {
    const blocks = section.blocks;
    const endpoints = ctx.endpoints.filter((e) => e.detailSections.includes(section));
    if (endpoints.length === 0) return;
    blocks.forEach((block, index) => {
        if (block.kind !== "paragraph") return;
        const text = noteText(block, blocks[index + 1]);
        if (!text) return;
        for (const endpoint of endpoints) addNote(endpoint, text);
    });
}

/* Merges notes into each endpoint's description: own description first, then the notes. */
export function mergeNotes(endpoints) {
    for (const endpoint of endpoints) {
        if (!endpoint.notes?.length) continue;
        endpoint.description = [endpoint.description, ...endpoint.notes].filter(Boolean).join("\n\n");
    }
}
