import test from "node:test";
import assert from "node:assert/strict";
import {
  accountRoleLabel,
  canProjectRole,
  normalizeAccountRole,
  normalizeAccountStatus,
  normalizeProjectRole,
  projectRoleForUser,
  projectRoleLabel,
} from "./permissions.js";

test("normalizes only schema-supported account and project roles", () => {
  assert.equal(normalizeAccountRole("ADMIN"), "admin");
  assert.equal(normalizeAccountRole("developer"), "developer");
  assert.equal(normalizeAccountRole("owner"), null);
  assert.equal(normalizeAccountStatus("ACTIVE"), "active");
  assert.equal(normalizeAccountStatus("deleted"), null);
  assert.equal(normalizeProjectRole("EDITOR"), "editor");
  assert.equal(normalizeProjectRole("admin"), null);
});

test("uses distinct, accurate labels for account roles and project roles", () => {
  assert.equal(accountRoleLabel("admin"), "Admin");
  assert.equal(accountRoleLabel("developer"), "Developer");
  assert.equal(projectRoleLabel("owner"), "Owner");
  assert.equal(projectRoleLabel("viewer"), "Viewer");
  assert.equal(projectRoleLabel("admin"), "Unknown project role");
});

test("applies least-privilege project-role capabilities and denies unknown roles", () => {
  assert.equal(canProjectRole("viewer", "viewer"), true);
  assert.equal(canProjectRole("viewer", "editor"), false);
  assert.equal(canProjectRole("editor", "editor"), true);
  assert.equal(canProjectRole("editor", "owner"), false);
  assert.equal(canProjectRole("owner", "editor"), true);
  assert.equal(canProjectRole("admin", "viewer"), false);
  assert.equal(canProjectRole("owner", "admin"), false);
});

test("resolves project access only from owner ID or a valid active membership role", () => {
  const project = {
    ownerId: 5,
    members: [
      { userId: 7, role: "editor" },
      { user: { id: 8 }, role: "viewer" },
      { userId: 9, role: "administrator" },
    ],
  };
  assert.equal(projectRoleForUser(project, { id: 5, role: "developer" }), "owner");
  assert.equal(projectRoleForUser(project, { id: 7, role: "admin" }), "editor");
  assert.equal(projectRoleForUser(project, { id: 8 }), "viewer");
  assert.equal(projectRoleForUser(project, { id: 9 }), null);
  assert.equal(projectRoleForUser(project, { id: 10, role: "admin" }), null);
  assert.equal(projectRoleForUser(project, null), null);
});
