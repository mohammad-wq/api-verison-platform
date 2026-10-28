import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMarkdownToOpenApi } from "../parser/index.js";
import { operationsForSpec } from "./openapi-endpoints.js";
import { detectAuthConfig, expiryFrom, jwtExpiry, normalizeHeaderFormat, resolveAuthConfig, tokenStatus } from "./auth-config.js";

const template = readFileSync(new URL("../templates/API_README_TEMPLATE.md", import.meta.url), "utf8");
const specOf = (markdown) => parseMarkdownToOpenApi(markdown).openapi;
const endpointsOf = (spec) => [...operationsForSpec(spec).values()];

test("detects the login endpoint, token path and header format from the README template", () => {
  const spec = specOf(template);
  const config = detectAuthConfig(spec, endpointsOf(spec));
  assert.equal(config.authRequired, true);
  assert.equal(config.loginMethod, "POST");
  assert.equal(config.loginPath, "/auth/login.php");
  assert.equal(config.tokenPath, "data.token");
  assert.equal(config.expiresPath, "data.expires_in");
  assert.equal(config.headerName, "Authorization");
  assert.equal(config.headerFormat, "Bearer {token}");
  assert.equal(config.source, "readme");
  assert.deepEqual(config.loginFields.map(({ name, secret }) => ({ name, secret })), [
    { name: "user_name", secret: false },
    { name: "login_password", secret: true },
  ]);
  assert.equal(config.loginFields[0].placeholder, "user@example.com");
  assert.equal(config.loginFields[1].placeholder, "");
});

test("an environment's login settings win over the detected endpoint", () => {
  const spec = specOf(template.replace("**Auth.**", "Environments: QA=https://qa.example.com|login=/auth/login.php|token=data.access|method=POST\n\n**Auth.**"));
  assert.equal(spec.servers[0].url, "https://qa.example.com");
  const config = detectAuthConfig(spec, endpointsOf(spec), spec.servers[0]);
  assert.equal(config.loginPath, "/auth/login.php");
  assert.equal(config.tokenPath, "data.access");
  assert.equal(config.loginFields.length, 2);
});

test("an API without a public login endpoint reports no login settings", () => {
  const spec = {
    openapi: "3.0.3",
    paths: { "/items": { get: { security: [{ BearerAuth: [] }], responses: { 200: { description: "ok" } } } } },
    components: { securitySchemes: { BearerAuth: { type: "http", scheme: "bearer" } } },
  };
  const config = detectAuthConfig(spec, endpointsOf(spec));
  assert.equal(config.authRequired, true);
  assert.equal(config.loginPath, "");
  assert.equal(config.source, "none");
});

test("an API key scheme sends the raw token in its header", () => {
  const spec = {
    openapi: "3.0.3",
    paths: { "/items": { get: { security: [{ Key: [] }], responses: {} } } },
    components: { securitySchemes: { Key: { type: "apiKey", in: "header", name: "X-Api-Key" } } },
  };
  const config = detectAuthConfig(spec, endpointsOf(spec));
  assert.equal(config.headerName, "X-Api-Key");
  assert.equal(config.headerFormat, "{token}");
});

test("custom settings override detected ones; README mode keeps them", () => {
  const detected = { authRequired: true, loginMethod: "POST", loginPath: "/auth/login.php", tokenPath: "data.token", headerName: "Authorization", headerFormat: "Bearer {token}", source: "readme" };
  assert.deepEqual(resolveAuthConfig(detected, null), detected);
  const custom = resolveAuthConfig(detected, { loginPath: "/login", tokenPath: "", headerFormat: "******", authRequired: false });
  assert.equal(custom.loginPath, "/login");
  assert.equal(custom.tokenPath, "data.token");
  assert.equal(custom.headerFormat, "Bearer {token}");
  assert.equal(custom.authRequired, false);
  assert.equal(custom.source, "custom");
});

test("header formats always contain {token}", () => {
  assert.equal(normalizeHeaderFormat("Token"), "Token {token}");
  assert.equal(normalizeHeaderFormat(""), "Bearer {token}");
  assert.equal(normalizeHeaderFormat("{token}"), "{token}");
});

test("token expiry comes from expires_in, epoch values, dates or the JWT exp claim", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(expiryFrom(3600, now), "2026-01-01T01:00:00.000Z");
  assert.equal(expiryFrom(1767229200, now), "2026-01-01T01:00:00.000Z");
  assert.equal(expiryFrom("2026-02-01T00:00:00Z", now), "2026-02-01T00:00:00.000Z");
  assert.equal(expiryFrom(null, now), null);
  const payload = Buffer.from(JSON.stringify({ exp: 1767229200 })).toString("base64url");
  assert.equal(jwtExpiry(`h.${payload}.s`), "2026-01-01T01:00:00.000Z");
  assert.equal(jwtExpiry("not-a-jwt"), null);
  assert.equal(tokenStatus({ token: "x", expiresAt: "2025-01-01T00:00:00Z" }, now), "expired");
  assert.equal(tokenStatus({ token: "x" }, now), "active");
  assert.equal(tokenStatus(null, now), "none");
});
