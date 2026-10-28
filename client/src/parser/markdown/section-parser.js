/*
 * Stage 2: build the heading tree and resolve each section's path prefix
 * before any endpoint is parsed.
 *
 * Prefix sources, in order:
 *   1. a code span in the heading:           "Roles — `admin/roles/`"
 *      several code spans share a common dir: "`cases/fetch/`, `cases/modify/`" -> cases
 *   2. a "Base path: `x`" line in the section body
 *   3. the parent section's prefix
 *
 * Prefixes are root-relative; they are never joined with the parent's.
 */
import { HTTP_METHODS } from "../ir/types.js";
import { codeSpans, stripInline } from "./inline.js";
const METHOD_WORD = HTTP_METHODS.join("|");
/* The path is usually in backticks; a bare path is accepted when it looks like one (contains "/" or "."). */
const BARE_PATH = String.raw`/?[A-Za-z0-9_{}.-]*[/.][A-Za-z0-9_{}./-]*(?:\?\S*)?`;
const ENDPOINT_HEADING = new RegExp(
    String.raw`^((?:${METHOD_WORD})(?:\s*(?:/|\bor\b)\s*(?:${METHOD_WORD}))*)\s+` +
        "(?:`([^`]+)`|(" + BARE_PATH + "))" +
        String.raw`(?:\s*—\s*` + "`" + String.raw`(\{[^` + "`" + String.raw`]*\})` + "`" + String.raw`)?(?=\s|$)`,
);
export function parseMethodList(text) {
    return text
        .split(/\s*(?:\/|\bor\b)\s*/)
        .map((method) => method.trim().toUpperCase())
        .filter((method) => HTTP_METHODS.includes(method));
}
export function buildSections(blocks, warnings) {
    const lastLine = blocks.length > 0 ? blocks[blocks.length - 1].lines[1] : 1;
    const root = {
        id: 0,
        level: 0,
        title: "",
        children: [],
        blocks: [],
        lines: [1, lastLine]
    };
    const stack = [root];
    let nextId = 1;
    for (const block of blocks) {
        if (block.kind !== "heading") {
            stack[stack.length - 1].blocks.push(block);
            continue;
        }
        while (stack[stack.length - 1].level >= block.level) {
            const closed = stack.pop();
            closed.lines[1] = block.lines[0] - 1;
        }
        const parent = stack[stack.length - 1];
        const section = {
            id: nextId++,
            level: block.level,
            heading: block,
            title: cleanTitle(block.text),
            parent,
            children: [],
            blocks: [],
            lines: [block.lines[0], lastLine]
        };
        parent.children.push(section);
        stack.push(section);
    }
    forEachSection(root, (section) => resolveOwnPrefix(section, warnings));
    return root;
}
function resolveOwnPrefix(section, warnings) {
    if (!section.heading)
        return;
    const text = section.heading.text;
    const endpoint = text.match(ENDPOINT_HEADING);
    if (endpoint) {
        section.endpointHeading = {
            methods: parseMethodList(endpoint[1]),
            target: (endpoint[2] ?? endpoint[3]).trim(),
            shorthand: endpoint[4]
        };
        return;
    }
    /* Code spans naming files (e.g. `cron/sendTaskReminders.php`) are not prefixes. */
    const prefixes = codeSpans(text)
        .map((span) => normalizePrefix(span.code))
        .filter((code) => code !== "" && !/\.[a-z0-9]+$/i.test(code));
    if (prefixes.length === 1) {
        section.ownPrefix = prefixes[0];
    }
    else if (prefixes.length > 1) {
        const common = commonDirectory(prefixes);
        if (common) {
            section.ownPrefix = common;
            section.prefixCandidates = prefixes;
        }
        else {
            warnings.push({
                code: "UNRESOLVED_PREFIX",
                message: `Heading "${stripInline(text)}" lists prefixes with no common directory: ${prefixes.join(", ")}`,
                lines: section.heading.lines
            });
        }
    }
    if (section.ownPrefix)
        return;
    for (const block of section.blocks) {
        if (block.kind !== "paragraph")
            continue;
        const basePath = block.text.match(/^Base path:\s*`([^`]+)`/m);
        if (basePath) {
            section.ownPrefix = normalizePrefix(basePath[1]);
            return;
        }
    }
}
export function effectivePrefix(section) {
    for (let s = section; s; s = s.parent) {
        if (s.ownPrefix)
            return s.ownPrefix;
    }
    return undefined;
}
function ancestorPrefixes(section) {
    const prefixes = [];
    for (let s = section; s; s = s.parent) {
        if (s.ownPrefix)
            prefixes.push(s.ownPrefix);
    }
    return prefixes;
}
/*
 * Resolves an endpoint reference against the section prefix.
 *
 *   "/cases/x.php"            -> absolute
 *   "masters/modules/x.php"   -> already starts with an enclosing prefix -> root-relative
 *   "fetch/getRoles.php"      -> prefix + "/" + value
 */
export function resolvePath(raw, section) {
    const [pathPart, query] = splitQuery(raw.trim());
    const prefix = effectivePrefix(section);
    let path;
    let unresolved = false;
    if (pathPart.startsWith("/")) {
        path = pathPart;
    }
    else if (ancestorPrefixes(section).some((candidate) => pathPart === candidate || pathPart.startsWith(candidate + "/"))) {
        path = "/" + pathPart;
    }
    else if (prefix) {
        path = `/${prefix}/${pathPart}`;
    }
    else {
        path = "/" + pathPart;
        unresolved = true;
    }
    return { path: normalizePath(path), query, unresolved };
}
export function splitQuery(value) {
    const index = value.indexOf("?");
    return index === -1
        ? [value, undefined]
        : [value.slice(0, index), value.slice(index + 1)];
}
export function normalizePath(path) {
    const normalized = ("/" + path.trim())
        .replace(/\/{2,}/g, "/")
        .replace(/\/+$/, "");
    return normalized === "" ? "/" : normalized;
}
function normalizePrefix(prefix) {
    return prefix.trim().replace(/^\/+|\/+$/g, "");
}
function commonDirectory(prefixes) {
    const split = prefixes.map((prefix) => prefix.split("/"));
    const common = [];
    for (let i = 0; i < split[0].length; i++) {
        const segment = split[0][i];
        if (split.every((parts) => parts[i] === segment)) {
            common.push(segment);
        }
        else {
            break;
        }
    }
    return common.length > 0 ? common.join("/") : undefined;
}
/* "Roles — `admin/roles/`" -> "Roles"; "Masters (lookup/reference data) — `masters/`" -> "Masters" */
export function cleanTitle(text) {
    return stripInline(text
        .replace(/\s*—\s*`[^`]*`.*$/, "")
        .replace(/`[^`]*`/g, "")
        .replace(/\([^)]*\)/g, "")).replace(/\s*—\s*$/, "").trim();
}
export function forEachSection(section, visit) {
    visit(section);
    for (const child of section.children)
        forEachSection(child, visit);
}
export function isWithin(section, ancestor) {
    for (let s = section; s; s = s.parent) {
        if (s === ancestor)
            return true;
    }
    return false;
}
/* Heading titles from the top-level section down, skipping empty titles. */
export function breadcrumb(section) {
    const titles = [];
    for (let s = section; s && s.level > 1; s = s.parent) {
        const title = s.endpointHeading
            ? ""
            : s.title || (s.ownPrefix ? s.ownPrefix + "/" : "");
        if (title)
            titles.unshift(title);
    }
    return titles;
}
/* The level-2 ancestor (or the section itself), used for tags. */
export function topSection(section) {
    let s = section;
    while (s.parent && s.parent.level >= 2)
        s = s.parent;
    return s;
}
