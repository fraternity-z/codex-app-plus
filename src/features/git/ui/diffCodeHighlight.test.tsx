import { describe, expect, it } from "vitest";
import { highlightCodeLine } from "./diffCodeHighlight";

describe("diffCodeHighlight", () => {
  it("highlights TypeScript keywords and strings", () => {
    const html = highlightCodeLine('const name = "codex"', 'src/App.tsx');

    expect(html).toContain('hljs-keyword');
    expect(html).toContain('hljs-string');
  });

  it("highlights JSON properties and numbers", () => {
    const html = highlightCodeLine('"count": 2', 'package.json');

    expect(html).toContain('hljs-attr');
    expect(html).toContain('hljs-number');
  });
});
