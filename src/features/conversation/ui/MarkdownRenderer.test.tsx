import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "./MarkdownRenderer";

describe("MarkdownRenderer", () => {
  it("applies the shared link and remark configuration", () => {
    const { container } = render(<MarkdownRenderer markdown={"[Example](https://example.com)\nnext line"} />);
    const link = screen.getByRole("link", { name: "Example" });

    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(container.querySelector("br")).not.toBeNull();
  });

  it("renders title markdown with inline paragraph semantics", () => {
    const { container } = render(<MarkdownRenderer className="title-markdown" markdown="**Inspecting**" variant="title" />);

    expect(container.querySelector(".title-markdown")).not.toBeNull();
    expect(container.querySelector(".title-markdown p")).toBeNull();
    expect(container.querySelector(".title-markdown strong")?.textContent).toBe("Inspecting");
  });
});
