import { describe, expect, it } from "vitest";
import {
  getReasoningEffortLabel,
  isReasoningEffortSelected,
  listSelectableReasoningEfforts
} from "./reasoningEffortOptions";

describe("reasoningEffortOptions", () => {
  it("uses minimal for the lowest visible effort when supported", () => {
    expect(listSelectableReasoningEfforts(["minimal", "low", "medium", "high", "xhigh"], "high")).toEqual([
      { value: "minimal", label: "极低" },
      { value: "low", label: "低" },
      { value: "medium", label: "中" },
      { value: "high", label: "高" },
      { value: "xhigh", label: "超高" }
    ]);
  });

  it("uses none for the lowest visible effort when the model only exposes none", () => {
    expect(listSelectableReasoningEfforts(["none", "medium", "high", "xhigh"], "high")).toEqual([
      { value: "none", label: "极低" },
      { value: "medium", label: "中" },
      { value: "high", label: "高" },
      { value: "xhigh", label: "超高" }
    ]);
  });

  it("treats none and minimal as the same displayed bucket", () => {
    expect(isReasoningEffortSelected("none", "minimal")).toBe(true);
    expect(isReasoningEffortSelected("minimal", "none")).toBe(true);
    expect(getReasoningEffortLabel("none")).toBe("极低");
  });
});
