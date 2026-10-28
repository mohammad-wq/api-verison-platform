/*
 * Stage 1: tokenize Markdown once into blocks with source line ranges.
 *
 * Later stages never re-scan raw lines; they work on these blocks.
 */
import { HTTP_METHODS } from "../ir/types.js";
const METHOD_ALTERNATIVES = HTTP_METHODS.join("|");
/* "GET", "POST/DELETE", "POST or DELETE" */
export const METHOD_CELL = new RegExp(`^(?:${METHOD_ALTERNATIVES})(?:\\s*(?:/|\\bor\\b)\\s*(?:${METHOD_ALTERNATIVES}))*$`);
const CELL_PER_LINE_HEADERS = new Set([
    "method",
    "http method",
    "verb",
    "endpoint",
    "path",
    "route",
    "url",
    "resource",
    "permission",
    "description",
    "auth"
]);
export function normalizeTableHeader(cell) {
    const normalized = stripHeaderInline(cell).toLowerCase().trim().replace(/[\s_-]+/g, " ");
    if (["method", "http method", "verb"].includes(normalized)) return "method";
    if (["endpoint", "path", "route", "url", "resource", "endpoint path", "api path"].includes(normalized)) return "endpoint";
    return normalized;
}
function stripHeaderInline(cell) {
    return cell.replace(/[`*_~]/g, "").trim();
}
export function parseDocument(markdown) {
    const lines = markdown.replace(/^﻿/, "").split(/\r?\n/);
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed === "") {
            i++;
            continue;
        }
        /* HTML comments (<!-- ... -->) are invisible in rendered Markdown, so they carry no content. */
        if (trimmed.startsWith("<!--")) {
            const rest = skipHtmlComment(lines, i);
            if (rest.text.trim() === "") {
                i = rest.next;
            } else {
                lines[rest.next] = rest.text;
                i = rest.next;
            }
            continue;
        }
        const fence = trimmed.match(/^(```+|~~~+)\s*([\w-]*)/);
        if (fence) {
            const marker = fence[1];
            const start = i;
            const body = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith(marker)) {
                body.push(lines[i]);
                i++;
            }
            blocks.push({
                kind: "fence",
                lang: fence[2].toLowerCase(),
                content: body.join("\n"),
                lines: [start + 1, Math.min(i, lines.length - 1) + 1]
            });
            i++;
            continue;
        }
        const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (heading) {
            blocks.push({
                kind: "heading",
                level: heading[1].length,
                text: heading[2].trim(),
                lines: [i + 1, i + 1]
            });
            i++;
            continue;
        }
        const plainSection = trimmed.match(/^(.{1,100}?)\s+[—–]\s+`([^`]+\/)`\s*$/);
        if (plainSection) {
            blocks.push({
                kind: "heading",
                level: 2,
                text: trimmed,
                lines: [i + 1, i + 1]
            });
            i++;
            continue;
        }
        const plainEndpoint = trimmed.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)(?:\s+(?:or\s+)?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS))?\s+(`[^`]+`|\/?\S+)$/i);
        if (plainEndpoint && !trimmed.includes("\t")) {
            blocks.push({
                kind: "heading",
                level: 3,
                text: trimmed.replace(/^([A-Z]+)/i, (method) => method.toUpperCase()),
                lines: [i + 1, i + 1]
            });
            i++;
            continue;
        }
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            blocks.push({ kind: "rule", lines: [i + 1, i + 1] });
            i++;
            continue;
        }
        if (trimmed.startsWith("|") &&
            i + 1 < lines.length &&
            isSeparatorRow(lines[i + 1])) {
            const start = i;
            const header = splitPipeRow(trimmed);
            const rows = [];
            i += 2;
            while (i < lines.length && lines[i].trim().startsWith("|")) {
                rows.push({ cells: splitPipeRow(lines[i].trim()), line: i + 1 });
                i++;
            }
            blocks.push({
                kind: "table",
                layout: "pipe",
                header,
                rows,
                lines: [start + 1, i]
            });
            continue;
        }
        const tabTable = readTabTable(lines, i);
        if (tabTable) {
            blocks.push(tabTable.block);
            i = tabTable.next;
            continue;
        }
        const cellTable = readCellPerLineTable(lines, i);
        if (cellTable) {
            blocks.push(cellTable.block);
            i = cellTable.next;
            continue;
        }

        function readTabTable(lines, start) {
            if (!lines[start].includes("\t")) return undefined;
            const header = lines[start].split("\t").map((cell) => cell.trim());
            const normalized = header.map(normalizeTableHeader);
            const endpointTable = normalized.includes("method") && normalized.includes("endpoint");
            const referenceTable = normalized.includes("entity") && normalized.some((cell) => /\((?:get|post|put|patch|delete)/i.test(cell));
            if (!endpointTable && !referenceTable) return undefined;

            const rows = [];
            let i = start + 1;
            while (i < lines.length && lines[i].includes("\t")) {
                const cells = lines[i].split("\t").map((cell) => cell.trim());
                if (cells.length >= 2) {
                    while (cells.length < header.length) cells.push("");
                    rows.push({ cells, line: i + 1 });
                    i++;
                    continue;
                }
                break;
            }
            if (rows.length === 0) return undefined;
            return {
                block: { kind: "table", layout: "tab", header, rows, lines: [start + 1, i] },
                next: i
            };
        }
        const start = i;
        const text = [];
        while (i < lines.length && !startsNewBlock(lines, i)) {
            text.push(lines[i].trim());
            i++;
        }
        blocks.push({
            kind: "paragraph",
            text: text.join("\n"),
            lines: [start + 1, i]
        });
    }
    return blocks;
}
/* Skips a comment that starts at lines[i]; returns the line to continue at and any text after "-->". */
function skipHtmlComment(lines, i) {
    for (let j = i; j < lines.length; j++) {
        const from = j === i ? lines[j].indexOf("<!--") + 4 : 0;
        const end = lines[j].indexOf("-->", from);
        if (end !== -1) {
            const text = lines[j].slice(end + 3);
            return text.trim() === "" ? { next: j + 1, text: "" } : { next: j, text };
        }
    }
    return { next: lines.length, text: "" };
}
function startsNewBlock(lines, i) {
    const trimmed = lines[i].trim();
    return (trimmed === "" ||
        trimmed.startsWith("<!--") ||
        /^(```+|~~~+)/.test(trimmed) ||
        /^#{1,6}\s+/.test(trimmed) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed) ||
        (trimmed.startsWith("|") &&
            i + 1 < lines.length &&
            isSeparatorRow(lines[i + 1])) ||
        isCellPerLineHeaderStart(lines, i));
}
function isSeparatorRow(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
}
/* Splits on unescaped pipes; `\|` inside a cell becomes a literal `|`. */
export function splitPipeRow(line) {
    const cells = [];
    let current = "";
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === "\\" && line[i + 1] === "|") {
            current += "|";
            i++;
        }
        else if (char === "|") {
            cells.push(current.trim());
            current = "";
        }
        else {
            current += char;
        }
    }
    cells.push(current.trim());
    /* Leading and trailing pipes produce empty edge cells. */
    if (line.trim().startsWith("|"))
        cells.shift();
    if (line.trim().endsWith("|") && !line.trim().endsWith("\\|"))
        cells.pop();
    return cells;
}
/*
 * One-cell-per-line tables, as produced by some exports:
 *
 *   Method
 *   Endpoint
 *   Permission
 *   GET
 *   `fetch/getRoles.php`
 *   `roles:view`
 *
 * A header is a run of known column names starting with "Method" then
 * "Endpoint". Each row starts at a method cell. A row that already has
 * as many cells as the header ends the table at the next non-method line.
 * Blank lines between cells are ignored.
 */
function isCellPerLineHeaderStart(lines, i) {
    if (normalizeTableHeader(lines[i]) !== "method")
        return false;
    const next = nextNonEmpty(lines, i + 1);
    return next !== -1 && normalizeTableHeader(lines[next]) === "endpoint";
}
function readCellPerLineTable(lines, start) {
    if (!isCellPerLineHeaderStart(lines, start))
        return undefined;
    const header = [];
    let i = start;
    while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (trimmed === "") {
            i++;
            continue;
        }
        if (!CELL_PER_LINE_HEADERS.has(trimmed.toLowerCase()) && normalizeTableHeader(trimmed) === trimmed.toLowerCase())
            break;
        header.push(trimmed);
        i++;
    }
    const rows = [];
    let lastLine = i;
    while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (trimmed === "") {
            i++;
            continue;
        }
        if (/^#{1,6}\s+/.test(trimmed) ||
            /^(```+|~~~+)/.test(trimmed) ||
            /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed) ||
            trimmed.startsWith("|")) {
            break;
        }
        if (METHOD_CELL.test(trimmed)) {
            rows.push({ cells: [trimmed], line: i + 1 });
        }
        else {
            const row = rows[rows.length - 1];
            if (!row || row.cells.length >= header.length)
                break;
            row.cells.push(trimmed);
        }
        lastLine = i + 1;
        i++;
    }
    if (rows.length === 0)
        return undefined;
    for (const row of rows) {
        while (row.cells.length < header.length)
            row.cells.push("");
    }
    return {
        block: {
            kind: "table",
            layout: "cell-per-line",
            header,
            rows,
            lines: [start + 1, lastLine]
        },
        next: lastLine
    };
}
function nextNonEmpty(lines, from) {
    for (let i = from; i < lines.length; i++) {
        if (lines[i].trim() !== "")
            return i;
    }
    return -1;
}
