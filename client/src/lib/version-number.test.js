import test from "node:test";
import assert from "node:assert/strict";
import { isVersionTaken, matchesVersionTemplate, suggestNextVersion } from "./version-number.js";

test("the first version is free-form: no suggestion without an existing version", () => {
  assert.equal(suggestNextVersion([]), null);
  assert.equal(suggestNextVersion([""]), null);
});

test("a single version is the format template; the next keeps its format and increments", () => {
  assert.equal(suggestNextVersion(["v1.0.0"]), "v1.0.1");
  assert.equal(suggestNextVersion(["2.4"]), "2.5");
  assert.equal(suggestNextVersion(["v1.2"]), "v1.3");
});

test("a freely typed later version is re-expressed in the initial version's format", () => {
  // Initial "v1.0.0", then the user typed "1.1.0" without the prefix — the next keeps the "v".
  assert.equal(suggestNextVersion(["v1.0.0", "1.1.0"]), "v1.1.1");
  assert.equal(suggestNextVersion(["v1.0.0", "1.1.0", "v1.2.0"]), "v1.2.1");
});

test("the suggestion never repeats a name that already exists", () => {
  // Latest is "1.1.0" while "v1.1.0" is already taken, so the bump has to skip it.
  assert.equal(suggestNextVersion(["v1.0.0", "1.1.0", "v1.1.0"]), "v1.1.1");
  assert.equal(suggestNextVersion(["1.0.0", "1.0.1", "1.0.2"]), "1.0.3");
});

test("a format without digits grows a numeric suffix", () => {
  assert.equal(suggestNextVersion(["beta"]), "beta-2");
  assert.equal(suggestNextVersion(["beta", "beta-2"]), "beta-3");
});

test("duplicate detection is trimmed and case-insensitive", () => {
  const existing = ["v1.0.0", "1.1.0"];
  assert.equal(isVersionTaken("v1.0.0", existing), true);
  assert.equal(isVersionTaken("  V1.0.0  ", existing), true);
  assert.equal(isVersionTaken("1.1.0", existing), true);
  assert.equal(isVersionTaken("v1.0.1", existing), false);
  assert.equal(isVersionTaken("", existing), false);
});

test("template matching permits a new numeric value but flags a changed naming scheme", () => {
  assert.equal(matchesVersionTemplate("v1.2.3", "v1.0.0"), true);
  assert.equal(matchesVersionTemplate("1.2.3", "v1.0.0"), false);
  assert.equal(matchesVersionTemplate("v1.2", "v1.0.0"), false);
  assert.equal(matchesVersionTemplate("version2", "version1"), true);
  assert.equal(matchesVersionTemplate("v2.0.0", "version1"), false);
});

test("suggestions retain leading zeroes from the first version template", () => {
  assert.equal(suggestNextVersion(["release-01.009"]), "release-01.010");
});
