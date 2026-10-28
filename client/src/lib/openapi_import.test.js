import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareOpenApiImport, validateOpenApiDocument } from "./openapi_import.js";
import { parseMarkdownToOpenApi } from "../parser/index.js";

const validSpec = {
  openapi: "3.0.3",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/items/{itemId}": {
      parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string" } }],
      get: { responses: { "200": { description: "Item returned" } } },
    },
  },
};

test("parses the README fixture and validates all detected operations", async () => {
  const markdown = await readFile(new URL("../../test-fixtures/DUMMY_PROJECT_TEST_README.md", import.meta.url), "utf8");
  const prepared = prepareOpenApiImport(markdown, { filename: "DUMMY_PROJECT_TEST_README.md" });
  assert.equal(prepared.sourceType, "markdown");
  assert.equal(prepared.statistics.endpoints, 14);
  assert.equal(prepared.warnings.length, 0);
  assert.deepEqual(validateOpenApiDocument(prepared.openapi), []);
});

test("accepts valid OpenAPI JSON while rejecting malformed and non-API input", () => {
  const prepared = prepareOpenApiImport(JSON.stringify(validSpec), { filename: "api.json" });
  assert.equal(prepared.sourceType, "json");
  assert.deepEqual(validateOpenApiDocument(prepared.openapi), []);
  assert.throws(() => prepareOpenApiImport('{"openapi":', { filename: "api.json" }), /Invalid JSON/);
  assert.throws(() => prepareOpenApiImport("# Notes only\n\nNo endpoints here."), /at least one HTTP operation/);
});

test("parses a plain Servers URL into the OpenAPI document", () => {
  const { openapi } = parseMarkdownToOpenApi("# Ticket API\n\nServers: http://api.example.com/backend/\n");
  assert.deepEqual(openapi.servers, [{ url: "http://api.example.com/backend" }]);
});

test("preserves a README's formatted server URL and request argument order", () => {
  const markdown = `# Ticket API

Servers: \`http://api.example.com/backend/\`

## Authentication — \`auth/\`

### POST \`auth/login.php\`
Auth: false
No token required.

Request:
\`\`\`json
{
  "identifier": "10002315",
  "password": "YourPassword@123"
}
\`\`\`
`;
  const { openapi } = parseMarkdownToOpenApi(markdown);
  const login = openapi.paths["/auth/login.php"].post;
  const request = login.requestBody.content["application/json"];

  assert.deepEqual(openapi.servers, [{ url: "http://api.example.com/backend" }]);
  assert.deepEqual(Object.keys(request.schema.properties), ["identifier", "password"]);
  assert.deepEqual(Object.keys(request.example), ["identifier", "password"]);
  assert.deepEqual(login.security, []);
});

test("requires path parameters and responses before a spec can be saved", () => {
  const invalid = structuredClone(validSpec);
  delete invalid.paths["/items/{itemId}"].parameters;
  delete invalid.paths["/items/{itemId}"].get.responses;
  const errors = validateOpenApiDocument(invalid);
  assert(errors.some((error) => error.includes('missing the required path parameter "itemId"')));
  assert(errors.some((error) => error.includes("must define at least one response")));
});

test("validates reusable parameters, responses, request bodies, schemas, and auth references", () => {
  const spec = {
    openapi: "3.0.3",
    info: { title: "Reusable components", version: "1.0.0" },
    components: {
      parameters: {
        ItemId: { name: "itemId", in: "path", required: true, schema: { type: "string" } },
      },
      responses: { Ok: { description: "Successful response" } },
      requestBodies: {
        CreateItem: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Item" } } },
        },
      },
      schemas: { Item: { type: "object", properties: { name: { type: "string" } } } },
      securitySchemes: { Bearer: { type: "http", scheme: "bearer" } },
    },
    paths: {
      "/items/{itemId}": {
        parameters: [{ $ref: "#/components/parameters/ItemId" }],
        get: {
          security: [{ Bearer: [] }],
          responses: { "200": { $ref: "#/components/responses/Ok" } },
        },
        post: {
          requestBody: { $ref: "#/components/requestBodies/CreateItem" },
          responses: { "201": { description: "Item created" } },
        },
      },
    },
  };
  assert.deepEqual(validateOpenApiDocument(spec), []);
});

test("rejects mismatched Markdown and JSON file extensions", () => {
  assert.throws(() => prepareOpenApiImport("# API", { filename: "api.json" }), /\.json extension/);
  assert.throws(() => prepareOpenApiImport(JSON.stringify(validSpec), { filename: "api.md" }), /Markdown extension/);
});
