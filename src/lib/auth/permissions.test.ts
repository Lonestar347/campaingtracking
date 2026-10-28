import { describe, expect, it } from "vitest";
import { can } from "@/lib/auth/permissions";

describe("can", () => {
  it("grants permissions by role", () => {
    expect(can("admin", "manage")).toBe(true);
    expect(can("editor", "write")).toBe(true);
    expect(can("editor", "manage")).toBe(false);
    expect(can("viewer", "comment")).toBe(true);
    expect(can("viewer", "write")).toBe(false);
  });

  it("denies unknown roles", () => {
    expect(can("guest" as never, "read")).toBe(false);
  });
});
