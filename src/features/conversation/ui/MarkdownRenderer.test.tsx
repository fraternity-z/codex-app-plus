import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("renders fenced code blocks with a language label, highlighting, and copy action", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const { container } = render(<MarkdownRenderer markdown={["```css", "padding: 12px 5px 18px;", "```"].join("\n")} />);

    expect(container.querySelector(".home-chat-code-block-language")?.textContent).toBe("css");
    expect(container.querySelector(".home-chat-code-block-code .hljs-attribute")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("padding: 12px 5px 18px;"));
  });

  it("renders openable file references with line labels", () => {
    const onOpenFileLink = vi.fn();
    const markdown = [
      "Video source: public/structure-tour.webm",
      "Content page: src/contentPages.ts:92",
      "Component: [custom label](src/pages/DesignStructurePage.tsx:219)",
      "Styles: src/styles/DesignStructurePage.css:684",
    ].join("\n");

    render(<MarkdownRenderer markdown={markdown} onOpenFileLink={onOpenFileLink} />);

    const videoLink = screen.getByRole("link", { name: "structure-tour.webm" });
    const tsLink = screen.getByRole("link", { name: "contentPages.ts (line 92)" });
    const componentLink = screen.getByRole("link", { name: "DesignStructurePage.tsx (line 219)" });
    const cssLink = screen.getByRole("link", { name: "DesignStructurePage.css (line 684)" });

    expect(videoLink.querySelector(".message-file-link-icon")).toBeNull();
    expect(tsLink.querySelector(".message-file-link-icon")).toBeNull();
    expect(componentLink.querySelector(".message-file-link-icon")).toBeNull();
    expect(cssLink.querySelector(".message-file-link-icon")).toBeNull();

    fireEvent.click(componentLink);

    expect(onOpenFileLink).toHaveBeenCalledWith({
      path: "src/pages/DesignStructurePage.tsx",
      line: 219,
      column: null,
    });
  });

  it("renders extensionless local references as emphasis instead of links", () => {
    render(<MarkdownRenderer markdown={"Use [codex-browser-use-iab](codex-browser-use-iab), then continue."} onOpenFileLink={vi.fn()} />);

    expect(screen.queryByRole("link", { name: "codex-browser-use-iab" })).toBeNull();
    expect(screen.getByText("codex-browser-use-iab")).toHaveClass("message-local-reference");
  });
});
