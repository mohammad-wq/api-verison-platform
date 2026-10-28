/*
 * Intermediate representation (IR) of an API description.
 *
 * The IR is independent of any input format: the Markdown parser maps
 * API.md into it, and other inputs can be mapped into it later. Every
 * piece of semantic data carries a source marker so reviewers can tell
 * documented facts from inferences and defaults.
 */

/**
 * @typedef {"GET"|"POST"|"PUT"|"PATCH"|"DELETE"|"HEAD"|"OPTIONS"} HttpMethod
 *
 * explicit  - stated by the document
 * inferred  - derived by a documented, deterministic rule (always warned)
 * defaulted - not documented; a neutral placeholder was used (always warned)
 * @typedef {"explicit"|"inferred"|"defaulted"} SourceKind
 *
 * 1-based, inclusive line range in the input document.
 * @typedef {[number, number]} LineRange
 *
 * @typedef {{ kind: SourceKind, lines?: LineRange }} Source
 *
 * @template T
 * @typedef {{ value: T, source: Source }} Sourced
 *
 * Every schema has a concrete type. `required` only ever comes from explicit documentation.
 * @typedef {Object} SchemaIR
 * @property {"string"|"integer"|"number"|"boolean"|"object"|"array"} type
 * @property {boolean} [nullable]
 * @property {string} [description]
 * @property {string} [format]
 * @property {Array<string|number|boolean>} [enum]
 * @property {unknown} [default]
 * @property {number} [maximum]
 * @property {Object<string, SchemaIR>} [properties]
 * @property {string[]} [required]
 * @property {Object<string, string>} [requiredWhen] field -> documented condition
 * @property {SchemaIR} [items]
 * @property {boolean} [typeUnknown] type could not be determined; `type` is a neutral fallback
 * @property {boolean} [placeholder] example was a placeholder such as { "...": "..." }
 *
 * @typedef {Object} ParameterIR
 * @property {string} name
 * @property {"query"|"path"|"header"} in
 * @property {Sourced<boolean>} required
 * @property {SchemaIR} schema
 * @property {string} [description]
 * @property {unknown} [example]
 *
 * @typedef {{ contentType: string, schema: SchemaIR, example?: unknown }} BodyIR
 *
 * @typedef {{ parameters: ParameterIR[], body?: Sourced<BodyIR>, bodyOptional?: boolean }} RequestIR
 *
 * A concrete status code, or "2XX" when success is documented but its code is not.
 * @typedef {number|"2XX"} StatusCode
 *
 * @typedef {{ status: Sourced<StatusCode>, description: string, body?: Sourced<BodyIR> }} ResponseIR
 *
 * @typedef {Object} EndpointIR
 * @property {Sourced<HttpMethod>} method
 * @property {string} path normalized: leading slash, no query string, no trailing slash
 * @property {string[]} section heading breadcrumb, e.g. ["Admin", "Roles"]
 * @property {string} [tag]
 * @property {string} [summary]
 * @property {string} [description]
 * @property {Sourced<"bearer"|"public">} security
 * @property {Sourced<string[]>} permissions e.g. "roles:view"; empty means none documented
 * @property {Sourced<string[]>} [permissionsAnyOf] permission alternatives; one listed code is sufficient
 * @property {RequestIR} request
 * @property {ResponseIR[]} responses
 * @property {string} [aliasOf] "METHOD /path" of the endpoint this one aliases
 * @property {LineRange} sourceLines
 *
 * @typedef {{ title: string, version: Sourced<string>, description?: string, servers?: Array<{ url: string, description?: string }>, endpoints: EndpointIR[] }} ApiSpecIR
 *
 * @typedef {"UNKNOWN_RESPONSE_STATUS"|"MISSING_RESPONSE_SCHEMA"|"MISSING_REQUIRED_FIELDS"|"MISSING_REQUEST_BODY"|"DUPLICATE_ENDPOINT"|"UNRESOLVED_PREFIX"|"CONDITIONAL_REQUIRED"|"UNBOUND_JSON_BLOCK"|"UNBOUND_RESPONSE_INFO"|"UNPARSED_BODY_REFERENCE"|"INFERRED_REQUEST_BINDING"|"INFERRED_METHOD"|"INFERRED_PERMISSION"|"REQUEST_BODY_OVERRIDDEN"|"PLACEHOLDER_EXAMPLE"|"UNKNOWN_TYPE"|"MISSING_PERMISSION"|"INVALID_PERMISSION"|"UNMATCHED_DETAIL_HEADING"|"INVALID_JSON_BLOCK"|"INVALID_TABLE_ROW"|"INVALID_SERVER"} WarningCode
 *
 * @typedef {{ code: WarningCode, endpoint?: string, message: string, lines?: LineRange }} ConversionWarning
 */

export const HTTP_METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS"
];
export function endpointKey(method, path) {
    return `${method} ${path}`;
}
