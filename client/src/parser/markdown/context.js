import { endpointKey } from "../ir/types.js";
export class ParseContext {
    warnings = [];
    endpoints = [];
    /* Response envelope documented once for the whole API. */
    envelope;
    /* Query parameters every paginated list accepts. */
    paginationParams = [];
    /* Plain example of the envelope, and the paginated-list `data` schema/example, if documented. */
    envelopeExample;
    listData;
    listExample;
    servers = [];
    /* Endpoints the document says need no token: [{ target: "auth/login.php", lines }]. */
    publicTargets = [];
    warn(code, message, options = {}) {
        this.warnings.push({
            code,
            message,
            ...(options.endpoint ? { endpoint: keyOf(options.endpoint) } : {}),
            ...(options.lines ? { lines: options.lines } : {})
        });
    }
}
export function keyOf(endpoint) {
    return endpointKey(endpoint.method.value, endpoint.path);
}
export function fileName(path) {
    const segments = path.split("?")[0].split("/");
    return segments[segments.length - 1];
}
export const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
