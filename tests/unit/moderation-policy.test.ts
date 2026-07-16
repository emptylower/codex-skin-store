import { describe, expect, it } from "vitest";

import {
  canPerform,
  isAdmin,
  isModeratorOrAdmin,
} from "~/domain/moderation/policy";

describe("moderation policy", () => {
  it("allows moderators to resolve reports and hide/restore content", () => {
    expect(canPerform("moderator", "report.resolve")).toBe(true);
    expect(canPerform("moderator", "report.dismiss")).toBe(true);
    expect(canPerform("moderator", "theme.remove")).toBe(true);
    expect(canPerform("moderator", "theme.restore")).toBe(true);
    expect(canPerform("moderator", "comment.remove")).toBe(true);
    expect(canPerform("moderator", "comment.restore")).toBe(true);
    expect(canPerform("moderator", "audit.read")).toBe(true);
  });

  it("denies moderators admin-only upload/role actions", () => {
    expect(canPerform("moderator", "user.suspend_uploads")).toBe(false);
    expect(canPerform("moderator", "user.restore_uploads")).toBe(false);
    expect(canPerform("moderator", "user.change_role")).toBe(false);
    expect(canPerform("moderator", "analytics.export")).toBe(false);
  });

  it("allows admins all moderation and admin-only actions", () => {
    expect(canPerform("admin", "user.suspend_uploads")).toBe(true);
    expect(canPerform("admin", "user.change_role")).toBe(true);
    expect(canPerform("admin", "theme.remove")).toBe(true);
    expect(canPerform("admin", "analytics.export")).toBe(true);
  });

  it("denies ordinary users all moderation actions", () => {
    expect(canPerform("user", "report.list")).toBe(false);
    expect(canPerform("user", "theme.remove")).toBe(false);
    expect(canPerform(null, "report.resolve")).toBe(false);
  });

  it("classifies roles correctly", () => {
    expect(isModeratorOrAdmin("moderator")).toBe(true);
    expect(isModeratorOrAdmin("admin")).toBe(true);
    expect(isModeratorOrAdmin("user")).toBe(false);
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("moderator")).toBe(false);
  });
});
