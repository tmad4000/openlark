import { describe, it, expect } from "vitest";
import { createId, paginate, UserStatus, OrgRole, DocPermission } from "../index.js";

describe("shared utilities", () => {
  describe("createId", () => {
    it("returns a string UUID", () => {
      const id = createId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("returns unique IDs", () => {
      const ids = new Set(Array.from({ length: 100 }, () => createId()));
      expect(ids.size).toBe(100);
    });
  });

  describe("paginate", () => {
    it("builds correct paginated response", () => {
      const result = paginate(["a", "b", "c"], 10, { page: 1, per_page: 3 });
      expect(result).toEqual({
        data: ["a", "b", "c"],
        total: 10,
        page: 1,
        per_page: 3,
        has_more: true,
      });
    });

    it("sets has_more to false on last page", () => {
      const result = paginate(["a"], 3, { page: 3, per_page: 1 });
      expect(result.has_more).toBe(false);
    });

    it("handles empty data", () => {
      const result = paginate([], 0, { page: 1, per_page: 10 });
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.has_more).toBe(false);
    });
  });

  describe("constants", () => {
    it("exports UserStatus values", () => {
      expect(UserStatus.ACTIVE).toBe("active");
      expect(UserStatus.DEACTIVATED).toBe("deactivated");
      expect(UserStatus.PENDING).toBe("pending");
    });

    it("exports OrgRole values", () => {
      expect(OrgRole.PRIMARY_ADMIN).toBe("primary_admin");
      expect(OrgRole.ADMIN).toBe("admin");
      expect(OrgRole.MEMBER).toBe("member");
    });

    it("exports DocPermission values", () => {
      expect(DocPermission.VIEWER).toBe("viewer");
      expect(DocPermission.EDITOR).toBe("editor");
      expect(DocPermission.MANAGER).toBe("manager");
      expect(DocPermission.OWNER).toBe("owner");
    });
  });
});
