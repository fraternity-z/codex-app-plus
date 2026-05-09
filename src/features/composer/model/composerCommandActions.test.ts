import { describe, expect, it } from "vitest";
import { toPermissionLevel } from "./composerCommandActions";

describe("composerCommandActions", () => {
  it("maps slash permission item keys to permission levels", () => {
    expect(toPermissionLevel("default")).toBe("default");
    expect(toPermissionLevel("autoReview")).toBe("autoReview");
    expect(toPermissionLevel("full")).toBe("full");
    expect(toPermissionLevel("unknown")).toBe("default");
  });
});
