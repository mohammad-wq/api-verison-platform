import test from "node:test";
import assert from "node:assert/strict";
import { baseUrlError, environmentLabel, hostOf, mergeSpecServers, reorderEnvironments, serverEnvironments, serverFor } from "./project-environments.js";

test("accepts HTTP and HTTPS environment base URLs, including path prefixes", () => {
  assert.equal(baseUrlError("https://qa.example.com/api"), null);
  assert.equal(baseUrlError("http://localhost:8080/backend/"), null);
});

test("rejects empty, relative, unsupported, credential-bearing, and query base URLs", () => {
  for (const value of ["", "/api", "ftp://api.example.com", "https://user:pass@example.com", "https://api.example.com?token=x"]) {
    assert(baseUrlError(value), `Expected "${value}" to be rejected`);
  }
});

const servers = [
  { url: "https://qa.example.com/", description: "QA" },
  { url: "https://api.example.com", description: "Production" },
  { url: "/relative" },
];

test("README servers become environments; relative and duplicate URLs are skipped", () => {
  const environments = serverEnvironments([...servers, { url: "https://qa.example.com" }]);
  assert.deepEqual(environments.map(({ name, baseUrl, source }) => ({ name, baseUrl, source })), [
    { name: "QA", baseUrl: "https://qa.example.com", source: "readme" },
    { name: "Production", baseUrl: "https://api.example.com", source: "readme" },
  ]);
});

test("a blank starter list is replaced by the README servers", () => {
  const merged = mergeSpecServers([{ id: "default", name: "Default", baseUrl: "" }], [], servers);
  assert.equal(merged.changed, true);
  assert.deepEqual(merged.environments.map((environment) => environment.name), ["QA", "Production"]);
  assert.deepEqual(merged.seen, ["https://qa.example.com", "https://api.example.com"]);
});

test("user environments are kept and only unseen README servers are appended", () => {
  const mine = [{ id: "local", name: "Local", baseUrl: "http://localhost:8080" }];
  const first = mergeSpecServers(mine, [], servers);
  assert.deepEqual(first.environments.map((environment) => environment.name), ["Local", "QA", "Production"]);

  const afterDelete = first.environments.filter((environment) => environment.name !== "QA");
  const second = mergeSpecServers(afterDelete, first.seen, servers);
  assert.equal(second.changed, false);
  assert.deepEqual(second.environments.map((environment) => environment.name), ["Local", "Production"]);
});

test("an environment already pointing at a README server is not duplicated", () => {
  const mine = [{ id: "mine", name: "Mine", baseUrl: "https://api.example.com/" }];
  const merged = mergeSpecServers(mine, [], servers);
  assert.deepEqual(merged.environments.map((environment) => environment.name), ["Mine", "QA"]);
});

test("environments reorder one step at a time and never fall off the list", () => {
  const list = ["a", "b", "c"].map((id) => ({ id }));
  assert.deepEqual(reorderEnvironments(list, "a", -1).map((e) => e.id), ["a", "b", "c"], "cannot move up from the top");
  assert.deepEqual(reorderEnvironments(list, "c", 1).map((e) => e.id), ["a", "b", "c"], "cannot move down from the bottom");
  assert.deepEqual(reorderEnvironments(list, "a", 1).map((e) => e.id), ["b", "a", "c"]);
  assert.deepEqual(reorderEnvironments(list, "c", -1).map((e) => e.id), ["a", "c", "b"]);
  assert.equal(reorderEnvironments(list, "missing", 1), list, "an unknown id is a no-op");
  assert.notEqual(reorderEnvironments(list, "a", 1)[0], list[0], "reorder returns a new array");
});

test("environment helpers find the matching server and a readable label", () => {
  assert.equal(serverFor(servers, { baseUrl: "https://qa.example.com" })?.description, "QA");
  assert.equal(serverFor(servers, { baseUrl: "" }), null);
  assert.equal(hostOf("https://api.example.com/v1/"), "api.example.com/v1");
  assert.equal(environmentLabel({ name: " ", baseUrl: "https://api.example.com" }), "api.example.com");
});
