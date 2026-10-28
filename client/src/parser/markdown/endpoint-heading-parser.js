/*
 * Stage 3b: endpoints declared by a heading ("### POST `auth/login.php`")
 * and endpoints declared only in prose.
 *
 * A heading that names only a file ("#### GET `getDisbursements.php`") is a
 * detail section for a table row with that method and file name inside the
 * same parent section; it merges into that row instead of creating a new endpoint.
 */
import { fileName } from "./context.js";
import { addParams, templateParams } from "./endpoint-details.js";
import { createDraft, applyDescription, setShorthandBody } from "./endpoint-table-parser.js";
import { codeSpans, stripInline } from "./inline.js";
import { forEachSection, isWithin, resolvePath } from "./section-parser.js";
export function parseHeadingEndpoints(root, ctx) {
    forEachSection(root, (section) => {
        const heading = section.endpointHeading;
        if (!heading || !section.heading)
            return;
        const lines = [section.lines[0], section.lines[1]];
        const resolved = resolvePath(heading.target, section);
        for (const method of heading.methods) {
            const matches = ctx.endpoints.filter((e) => e.method.value === method &&
                fileName(e.path) === fileName(resolved.path) &&
                section.parent !== undefined &&
                isWithin(e.declaredIn, section.parent));
            const exact = matches.filter((e) => e.path === resolved.path);
            const target = exact[0] ?? (matches.length === 1 ? matches[0] : undefined);
            if (matches.length > 1 && !target) {
                ctx.warn("UNMATCHED_DETAIL_HEADING", `Heading "${section.heading.text}" matches ${matches.length} table rows; not merged`, { lines: section.heading.lines });
                continue;
            }
            if (target) {
                target.detailSections.push(section);
                addParams(target, templateParams(resolved.query, section.heading.lines));
                if (heading.shorthand)
                    setShorthandBody(target, heading.shorthand, section.heading.lines, ctx);
                continue;
            }
            const draft = createDraft({
                method,
                path: resolved.path,
                section,
                origin: "heading",
                lines
            });
            /* Tag and breadcrumb come from the enclosing section, not the heading itself. */
            draft.declaredIn = section;
            draft.detailSections.push(section);
            addParams(draft, templateParams(resolved.query, section.heading.lines));
            if (heading.shorthand)
                setShorthandBody(draft, heading.shorthand, section.heading.lines, ctx);
            if (resolved.unresolved) {
                ctx.warn("UNRESOLVED_PREFIX", `No path prefix found for "${heading.target}"`, {
                    endpoint: draft,
                    lines: section.heading.lines
                });
            }
            const upperTable = ctx.endpoints.some((e) => e.origin === "table" && e.method.value === method && fileName(e.path) === fileName(draft.path));
            if (upperTable) {
                ctx.warn("UNMATCHED_DETAIL_HEADING", `Heading "${section.heading.text}" has a same-named table row elsewhere; kept as a separate endpoint`, { endpoint: draft, lines: section.heading.lines });
            }
            ctx.endpoints.push(draft);
        }
    });
}
/*
 * Prose declarations:
 *   "Also reachable at `cases/fetch/getCaseUpdates.php?case_id=1` (alias)"
 *   "`masters/app_settings` also has `fetch/getSettingByKey.php?setting_key=x` → ..."
 *
 * The alias keeps an explicit GET (the target is a GET). A method-less
 * "also has" endpoint is an inference from the path word "fetch".
 */
export function parseProseEndpoints(root, ctx) {
    forEachSection(root, (section) => {
        for (const block of section.blocks) {
            if (block.kind === "table") {
                for (const row of block.rows) {
                    const alias = findAlias(row.cells.join(" "));
                    if (alias)
                        addAlias(ctx, section, alias, [row.line, row.line], row.cells);
                }
            }
            else if (block.kind === "paragraph") {
                const alias = findAlias(block.text);
                if (alias)
                    addAlias(ctx, section, alias, block.lines, [block.text]);
                const also = block.text.match(/^`([^`]+)`\s+also has\s+`((?:fetch|modify|remove)\/[^`]+\.php[^`]*)`/m);
                if (also) {
                    const method = also[2].startsWith("fetch/") ? "GET" : "POST";
                    const resolved = resolvePath(`${also[1].replace(/\/+$/, "")}/${also[2]}`, section);
                    if (!exists(ctx, method, resolved.path)) {
                        const draft = createDraft({
                            method,
                            path: resolved.path,
                            section,
                            origin: "prose",
                            lines: block.lines,
                            methodSource: "inferred",
                            description: stripInline(block.text.split("→")[1] ?? "").trim() || undefined
                        });
                        addParams(draft, templateParams(resolved.query, block.lines));
                        ctx.warn("INFERRED_METHOD", `Method is not stated; ${method} inferred from the "${also[2].split("/")[0]}/" directory`, { endpoint: draft, lines: block.lines });
                        ctx.endpoints.push(draft);
                    }
                }
            }
        }
    });
}
function findAlias(text) {
    const match = text.match(/(?:Also )?reachable at\s+`([^`]+)`\s*\(alias\)/i);
    return match?.[1];
}
function addAlias(ctx, section, aliasTarget, lines, cells) {
    const resolved = resolvePath(aliasTarget, section);
    /* The aliased endpoint is the first GET endpoint on the same table row. */
    const source = ctx.endpoints.find((e) => e.origin === "table" && e.sourceLines[0] === lines[0] && e.sourceLines[1] === lines[1]);
    if (!source || exists(ctx, source.method.value, resolved.path))
        return;
    const draft = createDraft({
        method: source.method.value,
        path: resolved.path,
        section,
        origin: "alias",
        lines,
        description: `Alias of ${source.method.value} ${source.path}`
    });
    draft.aliasOf = `${source.method.value} ${source.path}`;
    draft.security = source.security;
    draft.permissions = source.permissions;
    addParams(draft, templateParams(resolved.query, lines));
    applyDescription(draft, "", lines, ctx);
    ctx.endpoints.push(draft);
    void cells;
    void codeSpans;
}
function exists(ctx, method, path) {
    return ctx.endpoints.some((e) => e.method.value === method && e.path === path);
}
