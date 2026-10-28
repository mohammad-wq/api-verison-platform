/*
 * Regression suite for the Markdown -> OpenAPI parser.
 *
 * Covers every documented input style (pipe, tab and cell-per-line tables,
 * heading and prose endpoints, conventions, examples) plus adversarial input:
 * duplicates, invalid JSON, CRLF, unbalanced shorthand, pathological documents.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseMarkdownToOpenApi } from "./index.js";
import { validateOpenApiDocument } from "../lib/openapi_import.js";

const parse = (markdown) => parseMarkdownToOpenApi(markdown);
const codes = (warnings) => warnings.map((warning) => warning.code);

/* ---------- entry-point guards ---------- */

test("rejects non-string input with a clear error", () => {
  assert.throws(() => parse(undefined), TypeError, /Expected the API documentation/);
  assert.throws(() => parse(null), TypeError, /null/);
  assert.throws(() => parse({ paths: {} }), TypeError, /object/);
});

test("an empty document yields no endpoints, a NO_ENDPOINTS warning and a valid skeleton", () => {
  const { openapi, warnings, statistics } = parse("# Notes\n\nJust some prose, no tables.\n");
  assert.equal(statistics.endpoints, 0);
  assert.ok(codes(warnings).includes("NO_ENDPOINTS_FOUND"));
  assert.deepEqual(openapi.paths, {});
  assert.equal(openapi.info.title, "Notes");
});

/* ---------- pipe tables ---------- */

const ROLES_DOC = `# Ticket API

## Roles — \`admin/roles/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`getRoles.php?role_id=1\` | \`roles:view\` | Returns one role. |
| POST | \`insertUpdateRole.php\` | \`roles:add\`/\`edit\` | Creates or updates a role. \`409\` role name already used. |
`;

test("pipe table rows become operations with permissions, query templates and error responses", () => {
  const { openapi, warnings } = parse(ROLES_DOC);
  assert.deepEqual(warnings, []);
  const get = openapi.paths["/admin/roles/getRoles.php"].get;
  assert.deepEqual(get.security, [{ BearerAuth: [] }]);
  assert.deepEqual(get["x-permissions"], ["roles:view"]);
  assert.deepEqual(get.parameters, [
    { name: "role_id", in: "query", required: true, schema: { type: "integer" }, example: 1 },
  ]);
  assert.deepEqual(get.responses, { "2XX": { description: "Success (status code not documented)" } });

  const post = openapi.paths["/admin/roles/insertUpdateRole.php"].post;
  assert.deepEqual(post["x-permissions"], ["roles:add", "roles:edit"]);
  assert.ok(post.responses["409"], "documented 409 becomes an error response");
  assert.ok(post.responses["2XX"], "undocumented success falls back to 2XX");
});

test("escaped pipes inside cells do not split the row", () => {
  const { openapi } = parse(`# API

## X — \`x/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`list.php\` | \`x:view\` | Supports \`a\\|b\` separators. |
`);
  const operation = openapi.paths["/x/list.php"].get;
  // description is omitted from the output when it equals the summary
  assert.match(operation.summary, /a\|b separators\./);
});

/* ---------- reference tables ---------- */

test("reference tables infer per-column permissions and keep entity descriptions", () => {
  const { openapi, warnings } = parse(`# Masters API

## Masters — \`masters/\`

| Entity | List (GET) | Single (GET) | Create / Update (POST) | Remove (POST) | Permission |
|---|---|---|---|---|---|
| Modules | \`modules/fetch/getModules.php\` | \`modules/fetch/getModule.php?module_id=1\` | \`modules/modify/insertUpdateModule.php\` | \`modules/remove/removeModule.php\` | \`modules:view\`/\`add\`/\`edit\`/\`delete\` |
`);
  assert.deepEqual(codes(warnings), ["INFERRED_PERMISSION"]);
  const list = openapi.paths["/masters/modules/fetch/getModules.php"].get;
  assert.deepEqual(list["x-permissions"], ["modules:view"]);
  assert.equal(list.summary, "Modules: List");

  const single = openapi.paths["/masters/modules/fetch/getModule.php"].get;
  assert.deepEqual(single.parameters, [
    { name: "module_id", in: "query", required: true, schema: { type: "integer" }, example: 1 },
  ]);

  const save = openapi.paths["/masters/modules/modify/insertUpdateModule.php"].post;
  assert.deepEqual(save["x-permissions"], ["modules:add", "modules:edit"]);

  const remove = openapi.paths["/masters/modules/remove/removeModule.php"].post;
  assert.deepEqual(remove["x-permissions"], ["modules:delete"]);
});

/* ---------- heading endpoints ---------- */

test("a heading endpoint with a body shorthand creates the operation with required fields", () => {
  const { openapi, warnings } = parse(`# API

## Roles — \`roles/\`

### POST \`insertUpdateRole.php\` — \`{role_name, permission_ids: [1,2], notes?}\`
`);
  const post = openapi.paths["/roles/insertUpdateRole.php"].post;
  assert.equal(post.requestBody.required, true);
  const schema = post.requestBody.content["application/json"].schema;
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["role_name", "permission_ids"]);
  assert.ok(!schema.required.includes("notes"));
  assert.deepEqual(schema.properties.permission_ids, { type: "array", items: { type: "integer" } });
  // Field types are not documented by a shorthand, so each unknown type is reported.
  assert.ok(codes(warnings).includes("UNKNOWN_TYPE"));
});

test("a detail heading merges into its table row instead of duplicating the operation", () => {
  const { openapi, warnings } = parse(`# API

## Items — \`items/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`getItems.php\` | \`items:view\` | List items. |

### GET \`getItems.php\`

Query params: \`category\` (\`books\`, \`games\`; default \`books\`), \`sku\` (required).

Errors: \`422\` invalid filter.
`);
  assert.deepEqual(codes(warnings), []);
  const operation = openapi.paths["/items/getItems.php"].get;
  const names = operation.parameters.map((p) => p.name).sort();
  assert.deepEqual(names, ["category", "sku"]);
  const category = operation.parameters.find((p) => p.name === "category");
  assert.deepEqual(category.schema.enum, ["books", "games"]);
  assert.equal(category.schema.default, "books");
  assert.equal(operation.parameters.find((p) => p.name === "sku").required, true);
  assert.ok(operation.responses["422"]);
});

/* ---------- description facts ---------- */

test("status mentions, multipart fields and header prose all land on the operation", () => {
  const { openapi, warnings } = parse(`# API

## Attachments — \`attachments/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| POST | \`attach.php\` | \`files:add\` | \`multipart/form-data\`: \`case_id\`, \`caption?\`, file field \`file\`. \`413\` file too large. Requests must include the \`Idempotency-Key\` header. |
`);
  assert.deepEqual(warnings, []);
  const post = openapi.paths["/attachments/attach.php"].post;
  const body = post.requestBody.content["multipart/form-data"].schema;
  assert.deepEqual(body.required, ["case_id", "file"]);
  assert.deepEqual(body.properties.file, { type: "string", format: "binary" });
  assert.ok(post.responses["413"]);
  const header = post.parameters.find((p) => p.name === "Idempotency-Key");
  assert.equal(header.in, "header");
  assert.equal(header.required, true);
  // The fields of later sentences are not swallowed into the multipart clause.
  assert.equal(post.parameters.length, 1);
});

test("a \"**requires** `name`\" mention makes that query parameter required", () => {
  const { openapi } = parse(`# API

## Cases — \`cases/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`getCases.php\` | \`cases:view\` | Filters by \`?status=\` . **requires** \`case_id\`. |
`);
  const parameters = openapi.paths["/cases/getCases.php"].get.parameters;
  const status = parameters.find((p) => p.name === "status");
  assert.equal(status.required, false);
  const caseId = parameters.find((p) => p.name === "case_id");
  assert.equal(caseId.required, true);
});

test("a documented non-JSON success media type becomes the response body", () => {
  const { openapi } = parse(`# API

## Exports — \`exports/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`items.csv\` | \`items:view\` | CSV report. |

### GET \`items.csv\`

Response: text/csv
`);
  const response = openapi.paths["/exports/items.csv"].get.responses["2XX"];
  assert.match(response.description, /text\/csv/);
  assert.ok(response.content["text/csv"]);
});

/* ---------- conventions ---------- */

test("the response envelope shapes error bodies and public-except marking clears security", () => {
  const { openapi } = parse(`# API

Every endpoint except \`health.php\` requires a bearer token.

JSON responses use this envelope:

\`\`\`json
{
  "statusCode": 200,
  "message": "Success",
  "data": {}
}
\`\`\`

## Public — \`public/\`

| Method | Endpoint | Permission | Auth | Description |
|---|---|---|---|---|
| GET | \`health.php\` |  | false | Health check. |
| GET | \`status.php\` | \`sys:view\` | true | Detailed status. \`503\` downstream is down. |
`);
  assert.deepEqual(openapi.paths["/public/health.php"].get.security, []);
  const status = openapi.paths["/public/status.php"].get;
  assert.deepEqual(status.security, [{ BearerAuth: [] }]);
  const errorBody = status.responses["503"].content["application/json"].schema;
  assert.equal(errorBody.properties.data.nullable, true);
  assert.equal(errorBody.properties.statusCode.type, "integer");
});

test("the Environments line produces servers with login settings", () => {
  const { openapi } = parse(`# API

Environments: Production=https://api.prod.com|login=/auth/login.php|token=data.token|method=POST; Staging=https://api.staging.com/v2

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`ping.php\` | \`sys:view\` | Ping. |
`);
  assert.equal(openapi.servers.length, 2);
  assert.deepEqual(openapi.servers[0], {
    url: "https://api.prod.com",
    description: "Production",
    "x-login-url": "/auth/login.php",
    "x-token-path": "data.token",
    "x-login-method": "POST",
  });
  assert.equal(openapi.servers[1].url, "https://api.staging.com/v2");
});

test("pagination prose parameters attach to Paginated list rows", () => {
  const { openapi } = parse(`# API

Accepts \`?page=\` (default 1), \`?page_size=\` (default 20, max 100).

## Cases — \`cases/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`getCases.php\` | \`cases:view\` | Paginated list of cases. |
`);
  const parameters = openapi.paths["/cases/getCases.php"].get.parameters;
  const page = parameters.find((p) => p.name === "page");
  assert.equal(page.schema.default, 1);
  const pageSize = parameters.find((p) => p.name === "page_size");
  assert.equal(pageSize.schema.maximum, 100);
  assert.equal(pageSize.required, false);
});

/* ---------- path resolution ---------- */

test("paths resolve against section prefixes: relative, absolute and prefix-qualified", () => {
  const { openapi } = parse(`# API

## Admin — \`admin/roles/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`getRoles.php\` | \`roles:view\` | Relative to the prefix. |
| GET | \`/abs/getRole.php\` | \`roles:view\` | Absolute paths stay root-relative. |
| GET | \`admin/roles/other.php\` | \`roles:view\` | Already prefixed paths are not doubled. |
| GET | \`other.php?role_id=1&mode=full\` | \`roles:view\` | Query strings are split off. |
`);
  assert.ok(openapi.paths["/admin/roles/getRoles.php"]);
  assert.ok(openapi.paths["/abs/getRole.php"]);
  assert.ok(openapi.paths["/admin/roles/other.php"]);
  const withQuery = openapi.paths["/admin/roles/other.php"].get;
  assert.deepEqual(withQuery.parameters.map((p) => p.name).sort(), ["mode", "role_id"]);
});

/* ---------- duplicates ---------- */

test("duplicate METHOD+path declarations are merged, not silently overwritten", () => {
  const { openapi, warnings } = parse(`# API

## Roles — \`roles/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`getRoles.php\` | \`roles:view\` | List roles. |
| GET | \`getRoles.php\` | \`roles:view\` | \`404\` role missing. \`403\` no access. |

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`getRoles.php\` | \`roles:view\` | List roles again. |
`);
  assert.ok(codes(warnings).includes("DUPLICATE_ENDPOINT"));
  const operation = openapi.paths["/roles/getRoles.php"].get;
  assert.ok(operation.responses["403"]);
  assert.ok(operation.responses["404"]);
  assert.match(operation.description, /List roles/);
  assert.deepEqual(validateOpenApiDocument(openapi), []);
});

/* ---------- JSON examples ---------- */

test("JSONC examples keep comments as descriptions; labelled segments bind per entity", () => {
  const { openapi } = parse(`# API

## Masters — \`masters/\`

| Entity | Create / Update (POST) | Permission |
|---|---|---|
| Systems | \`systems/modify/insertUpdateSystem.php\` | \`systems:add\`/\`edit\` |
| Categories | \`categories/modify/insertUpdateCategory.php\` | \`categories:add\`/\`edit\` |

Request examples:

\`\`\`json
// Systems
{
  "system_code": "TAL", // max 10 characters
  "system_name": "Talimiyah"
}
// Categories
{
  "category_code": "ACAD", // max 10 characters
  "sys_id": 1
}
\`\`\`
`);
  const system = openapi.paths["/masters/systems/modify/insertUpdateSystem.php"].post.requestBody.content["application/json"];
  assert.equal(system.schema.properties.system_code.maxLength, 10);
  assert.equal(system.schema.properties.system_code.description, "max 10 characters");
  assert.deepEqual(system.example, { system_code: "TAL", system_name: "Talimiyah" });

  const category = openapi.paths["/masters/categories/modify/insertUpdateCategory.php"].post.requestBody.content["application/json"];
  assert.equal(category.schema.properties.category_code.maxLength, 10);
  assert.deepEqual(category.example, { category_code: "ACAD", sys_id: 1 });
});

test("null and empty-array example values are surfaced as UNKNOWN_TYPE warnings", () => {
  const { openapi, warnings } = parse(`# API

## Items — \`items/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`getItem.php\` | \`items:view\` | One item. |

### GET \`getItem.php\`

Response \`data\`:
\`\`\`json
{
  "item_id": 1,
  "deleted_at": null,
  "tags": []
}
\`\`\`
`);
  const unknown = warnings.find((warning) => warning.code === "UNKNOWN_TYPE");
  assert.ok(unknown, "expected an UNKNOWN_TYPE warning");
  assert.match(unknown.message, /deleted_at/);
  assert.match(unknown.message, /tags\[\]/);
  const schema = openapi.paths["/items/getItem.php"].get.responses["2XX"]
    .content["application/json"].schema;
  assert.equal(schema.properties.deleted_at.nullable, true);
  assert.equal(schema.properties.tags.items.type, "string");
});

test('placeholder objects ("...": "...") are reported and kept as opaque objects', () => {
  const { openapi, warnings } = parse(`# API

## Users — \`users/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`getUser.php\` | \`users:view\` | One user. |

### GET \`getUser.php\`

Response \`data\`:
\`\`\`json
{
  "u_id": 1,
  "access_permissions": { "...": "..." }
}
\`\`\`
`);
  assert.ok(codes(warnings).includes("PLACEHOLDER_EXAMPLE"));
  const schema = openapi.paths["/users/getUser.php"].get.responses["2XX"]
    .content["application/json"].schema;
  assert.equal(schema.properties.access_permissions.type, "object");
  assert.ok(!schema.properties.access_permissions.properties);
});

/* ---------- robustness ---------- */

test("an invalid fenced JSON block warns but never aborts the parse", () => {
  const { openapi, warnings } = parse(`# API

## X — \`x/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| POST | \`save.php\` | \`x:add\` | Save. |

### POST \`save.php\`

Request:
\`\`\`json
{ "a": 1,
\`\`\`
`);
  assert.ok(codes(warnings).includes("INVALID_JSON_BLOCK"));
  assert.ok(openapi.paths["/x/save.php"].post);
});

test("CRLF and LF documents parse to the same OpenAPI document", () => {
  const lf = `# API\n\n## X — \`x/\`\n\n| Method | Endpoint | Permission | Description |\n|---|---|---|---|\n| GET | \`list.php\` | \`x:view\` | List. |\n`;
  const crlf = lf.replace(/\n/g, "\r\n");
  assert.deepEqual(parse(crlf).openapi, parse(lf).openapi);
});

test("an unparseable body shorthand warns instead of producing a broken body", () => {
  const { openapi, warnings } = parse(`# API

## X — \`x/\`

### POST \`save.php\` — \`{1invalid}\`
`);
  assert.ok(codes(warnings).includes("UNPARSED_BODY_REFERENCE"));
  assert.ok(openapi.paths["/x/save.php"].post);
  assert.ok(!openapi.paths["/x/save.php"].post.requestBody);
});

test("malformed table rows and unknown permission cells are warned, not thrown", () => {
  const { openapi, warnings } = parse(`# API

## X — \`x/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET |  | \`x:view\` | Row with no endpoint. |
| GET | \`ok.php\` | Contact the admin | Unclear permission text. |
`);
  assert.ok(codes(warnings).includes("INVALID_TABLE_ROW"));
  assert.ok(codes(warnings).includes("INVALID_PERMISSION"));
  assert.ok(openapi.paths["/x/ok.php"].get);
});

test("permission alternatives are preserved without treating 'or' as invalid text", () => {
  const { openapi, warnings } = parse(`# API

## Tickets — \`tickets/\`

| Method | Endpoint | Permission |
|---|---|---|
| GET | \`fetch.php\` | \`tickets:fetch\` or \`tickets:fetch_all\` |
`);
  const operation = openapi.paths["/tickets/fetch.php"].get;
  assert.deepEqual(operation["x-permissions-any-of"], ["tickets:fetch", "tickets:fetch_all"]);
  assert.ok(!codes(warnings).includes("INVALID_PERMISSION"));
});

test("typed shorthand documents fields without requiring placeholder example values", () => {
  const { openapi, warnings } = parse(`# API

## Items — \`items/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| POST | \`save.php\` | \`items:add\` | Save: \`{id: integer, active: boolean, tags: string[]}\` |
`);
  const schema = openapi.paths["/items/save.php"].post.requestBody.content["application/json"].schema;
  assert.deepEqual(schema.properties, {
    id: { type: "integer" }, active: { type: "boolean" }, tags: { type: "array", items: { type: "string" } }
  });
  assert.ok(!codes(warnings).includes("UNKNOWN_TYPE"));
});

test("unterminated code fences at EOF are read to the end", () => {
  const { openapi } = parse(`# API

## X — \`x/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| POST | \`save.php\` | \`x:add\` | Save. |

### POST \`save.php\`

Request:
\`\`\`json
{ "a": 1 }`);
  assert.deepEqual(
    openapi.paths["/x/save.php"].post.requestBody.content["application/json"].example,
    { a: 1 },
  );
});

/* ---------- alternate table layouts ---------- */

test("tab-separated endpoint tables parse like pipe tables", () => {
  const { openapi, warnings } = parse("# Tab API\n\n## T — `t/`\n\nMethod\tEndpoint\tPermission\nGET\t`list.php`\tt:view\n");
  assert.deepEqual(warnings, []);
  assert.deepEqual(openapi.paths["/t/list.php"].get["x-permissions"], ["t:view"]);
});

test("one-cell-per-line exported tables parse into rows", () => {
  const { openapi } = parse(`# Cell API

Method
Endpoint
Permission
GET
\`fetch/getThings.php\`
\`things:view\`
POST
\`modify/saveThing.php\`
\`things:add\`
`);
  assert.ok(openapi.paths["/fetch/getThings.php"]);
  assert.deepEqual(openapi.paths["/modify/saveThing.php"].post["x-permissions"], ["things:add"]);
});

/* ---------- aliases ---------- */

test("an alias row creates the alias operation with x-alias-of", () => {
  const { openapi } = parse(`# API

## Cases — \`cases/\`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | \`getCase.php\` | \`cases:view\` | One case. Also reachable at \`fetch/getCaseById.php\` (alias). |
`);
  const alias = openapi.paths["/cases/fetch/getCaseById.php"].get;
  assert.equal(alias["x-alias-of"], "GET /cases/getCase.php");
});

/* ---------- integration ---------- */

test("a complex document passes the platform's OpenAPI validator with unique operationIds", () => {
  const { openapi } = parse(`# Centralized Ticket Management API

Enterprise ticket platform with dynamic RBAC.

Environments: Production=https://tickets.example.com/api; Staging=https://staging.tickets.example.com/api

Every endpoint except \`auth/login.php\` requires a bearer token.

JSON responses use this envelope:

\`\`\`json
{ "statusCode": 200, "message": "Success", "data": {}, "timestamp": "2026-10-19T00:00:00Z" }
\`\`\`

## Authentication — \`auth/\`

| Method | Endpoint | Permission | Auth | Description |
|---|---|---|---|---|
| POST | \`login.php\` |  | false | Signs in a user. \`401\` invalid credentials. \`429\` too many failed attempts. |
| GET | \`me.php\` |  | true | Returns the signed-in user. |

### POST \`login.php\`

Request:
\`\`\`json
{ "email": "admin@domain.local", "password": "Password@123" }
\`\`\`

Response:
\`\`\`json
{ "statusCode": 200, "message": "Success", "data": { "token": "jwt", "expires_in": 3600 }, "timestamp": "2026-10-19T00:00:00Z" }
\`\`\`

### GET \`me.php\`

Response \`data\`:
\`\`\`json
{ "u_id": 1, "email": "admin@domain.local", "role_name": "Super Admin", "accessible_systems": ["*"] }
\`\`\`

## Masters — \`masters/\`

| Entity | List (GET) | Single (GET) | Create / Update (POST) | Remove (POST/DELETE) | Permission |
|---|---|---|---|---|---|
| Systems | \`systems/fetch/getSystems.php\` | \`systems/fetch/getSystem.php?sys_id=1\` | \`systems/modify/insertUpdateSystem.php\` | \`systems/remove/removeSystem.php\` | \`systems:view\`/\`add\`/\`edit\`/\`delete\` |
`);
  assert.deepEqual(validateOpenApiDocument(openapi), []);
  const operationIds = [];
  for (const pathItem of Object.values(openapi.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (method === "parameters") continue;
      operationIds.push(operation.operationId);
    }
  }
  assert.equal(new Set(operationIds).size, operationIds.length);
  // The public login endpoint carries `security: []` so the tester sends no token.
  assert.deepEqual(openapi.paths["/auth/login.php"].post.security, []);
});
