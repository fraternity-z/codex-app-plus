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

  it("renders inline and display LaTeX math using $...$ delimiters", () => {
    const { container } = render(
      <MarkdownRenderer markdown={"Inline $a^2 + b^2 = c^2$ and block\n\n$$\n\\int_0^1 x\\,dx\n$$"} />,
    );

    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
  });

  it("normalizes LaTeX-style \\[...\\] and \\(...\\) delimiters from LLM output", () => {
    const markdown = [
      "泰勒展开公式：",
      "\\[",
      "f(x)=\\sum_{n=0}^{\\infty}\\frac{f^{(n)}(a)}{n!}(x-a)^n",
      "\\]",
      "内联形式 \\(e^{i\\pi}+1=0\\) 也可以。",
    ].join("\n");

    const { container } = render(<MarkdownRenderer markdown={markdown} />);

    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(container.textContent ?? "").not.toContain("\\[");
    expect(container.textContent ?? "").not.toContain("\\(");
  });

  it("preserves LaTeX-like sequences inside code blocks", () => {
    const markdown = ["```tex", "\\[ x = 1 \\]", "```"].join("\n");
    const { container } = render(<MarkdownRenderer markdown={markdown} />);

    expect(container.querySelector(".katex")).toBeNull();
    expect(container.querySelector("code")?.textContent).toContain("\\[ x = 1 \\]");
  });
});
