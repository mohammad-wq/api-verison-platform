/*
 * Stage 3a: facts the document states once for the whole API.
 *
 *   - the response envelope           ({ "statusCode": 200, "message": "...", "data": {} })
 *   - the paginated list envelope     ({ "items": [], "pagination": {} })
 *   - the query parameters every list accepts ("Accepts `?page=` (default 1), ...")
 *   - which endpoints need no token   ("Every endpoint except `auth/login.php` requires ...")
 *
 * This runs before the tables are read, because their rows use these facts.
 */
import { mentionedParams } from "./endpoint-details.js";
import { parseJsonValue, toPlain } from "./json-block.js";
import { codeSpans } from "./inline.js";
import { inferSchema } from "../schema-inference.js";
import { forEachSection } from "./section-parser.js";

const PUBLIC_EXCEPT = /every endpoint except\s+((?:`[^`]+`[\s,]*(?:and|or)?\s*)+)\s*requires/i;

function objectKeys(node) {
    return node.t === "object" ? node.entries.map(([key]) => key) : [];
}

export function parseConventions(root, ctx) {
    forEachSection(root, (section) => {
        for (const block of section.blocks) {
            if (block.kind === "fence" && (block.lang === "json" || block.lang === "")) {
                let node;
                try {
                    node = parseJsonValue(block.content);
                } catch {
                    continue;
                }
                const keys = objectKeys(node);
                if (!ctx.envelope && keys.includes("statusCode") && keys.includes("data")) {
                    ctx.envelope = inferSchema(node);
                    ctx.envelopeExample = toPlain(node);
                    block.consumed = true;
                } else if (!ctx.listData && keys.includes("items") && keys.includes("pagination")) {
                    ctx.listData = inferSchema(node);
                    ctx.listExample = toPlain(node);
                    block.consumed = true;
                }
            } else if (block.kind === "paragraph") {
                if (/^Accepts\s+`\?/i.test(block.text) && ctx.paginationParams.length === 0) {
                    ctx.paginationParams = mentionedParams(block.text, block.lines);
                }
                const environments = block.text.match(/^Environments?:\s*(.+)$/im);
                if (environments) {
                    for (const entry of environments[1].split(";")) {
                        const [environment, ...settings] = entry.trim().split("|");
                        const match = environment.match(/^([^=]+?)\s*=\s*(https?:\/\/\S+)$/i);
                        if (!match) {
                            ctx.warn("INVALID_SERVER", `Invalid environment entry "${entry.trim()}"; expected Name=https://host`, { lines: block.lines });
                            continue;
                        }
                        const [, name, url] = match;
                        try {
                            const parsed = new URL(url);
                            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported URL protocol");
                            const server = { url: parsed.toString().replace(/\/$/, ""), description: name.trim() };
                            for (const setting of settings) {
                                const [key, ...values] = setting.split("=");
                                const value = values.join("=").trim();
                                if (!value || !["login", "token", "method"].includes(key.trim().toLowerCase())) {
                                    throw new Error(`Unknown or empty environment setting "${setting.trim()}"`);
                                }
                                const normalizedKey = key.trim().toLowerCase();
                                if (normalizedKey === "login") {
                                    if (/^https?:\/\//i.test(value)) {
                                        const loginUrl = new URL(value);
                                        if (!["http:", "https:"].includes(loginUrl.protocol)) throw new Error("Unsupported login URL protocol");
                                        server["x-login-url"] = loginUrl.toString();
                                    } else if (value.startsWith("/") && !/[\s?#]/.test(value)) {
                                        server["x-login-url"] = value;
                                    } else {
                                        throw new Error(`Invalid login URL "${value}"; use an absolute http(s) URL or a path beginning with /`);
                                    }
                                } else if (normalizedKey === "token") {
                                    server["x-token-path"] = value;
                                } else {
                                    const method = value.toUpperCase();
                                    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new Error(`Invalid login method "${value}"`);
                                    server["x-login-method"] = method;
                                }
                            }
                            ctx.servers.push(server);
                        } catch {
                            ctx.warn("INVALID_SERVER", `Invalid environment entry "${entry.trim()}"`, { lines: block.lines });
                        }
                    }
                }
                const serverDeclaration = block.text.match(/^Servers?:\s*(?:`(https?:\/\/[^`\s]+)`|(https?:\/\/\S+))\s*$/im);
                if (serverDeclaration) {
                    const serverUrl = serverDeclaration[1] ?? serverDeclaration[2];
                    try {
                        const parsed = new URL(serverUrl);
                        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
                            throw new Error("Server URL must be an HTTP(S) URL without credentials, query, or fragment");
                        }
                        const url = parsed.toString().replace(/\/$/, "");
                        if (!ctx.servers.some((server) => server.url === url)) ctx.servers.push({ url });
                    } catch {
                        ctx.warn("INVALID_SERVER", `Invalid server URL "${serverUrl}"`, { lines: block.lines });
                    }
                }
                const except = block.text.match(PUBLIC_EXCEPT);
                if (except) {
                    for (const span of codeSpans(except[1])) {
                        ctx.publicTargets.push({ target: span.code.replace(/^\/+/, ""), lines: block.lines });
                    }
                }
            }
        }
    });
}
