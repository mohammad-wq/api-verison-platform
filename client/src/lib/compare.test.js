import test from "node:test";
import assert from "node:assert/strict";
import { buildComparison } from "./compare.js";
import { compareMaps } from "./diff.js";

const field = (type, extra = {}) => ({ type, format: null, required: false, enum: null, default: null, nullable: false, ...extra });

test("a removed and an added field with the same definition and parent become one rename", () => {
  const rows = compareMaps(new Map([["email", field("string")], ["password", field("string", { required: true })]]), new Map([["identifier", field("string")], ["password", field("string", { required: true })]]));
  assert.deepEqual(rows.map((r) => [r.status, r.oldKey ?? null, r.key]), [["renamed", "email", "identifier"], ["same", null, "password"]]);
});

test("fields under different parents or with different definitions are not paired", () => {
  const rows = compareMaps(new Map([["user.name", field("string")], ["age", field("integer")]]), new Map([["account.name", field("string")], ["years", field("string")]]));
  assert.deepEqual(rows.map((r) => r.status).sort(), ["added", "added", "removed", "removed"]);
});

test("an ambiguous pairing (two candidates with the same definition) is left as added/removed", () => {
  const rows = compareMaps(new Map([["a", field("string")], ["b", field("string")]]), new Map([["c", field("string")], ["d", field("string")]]));
  assert.ok(rows.every((r) => r.status !== "renamed"));
});

test("the change list describes a renamed body field and an added parameter", () => {
  const op = (name, params = []) => ({
    requiresAuth: false,
    requestBody: { contentType: "application/json", required: true, schema: { type: "object", properties: { [name]: { type: "string" } } } },
    parameters: params,
    responses: [],
  });
  const comparison = buildComparison(op("email"), op("identifier", [{ in: "query", name: "limit", type: "integer" }]));
  assert.deepEqual(
    comparison.changes.map((c) => [c.kind, c.area, c.oldName, c.name]),
    [["renamed", "Request body field", "email", "identifier"], ["added", "Query parameter", null, "limit"]],
  );
  assert.equal(comparison.summary.find((s) => s.id === "body").text, "1 renamed");
});
