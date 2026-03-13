import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";

type HighlightLanguage =
  | "bash"
  | "css"
  | "javascript"
  | "json"
  | "markdown"
  | "python"
  | "rust"
  | "typescript"
  | "xml";

const HIGHLIGHT_CACHE = new Map<string, string>();
let languagesRegistered = false;

function ensureLanguagesRegistered(): void {
  if (languagesRegistered) {
    return;
  }
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("rust", rust);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("xml", xml);
  languagesRegistered = true;
}

function escapeHtml(content: string): string {
  return content
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getFileExtension(path: string | undefined): string {
  if (path === undefined) {
    return "";
  }
  const lastSegment = path.split(/[\\/]/).pop() ?? "";
  const extension = lastSegment.split(".").pop();
  return extension?.toLowerCase() ?? "";
}

function resolveHighlightLanguage(path: string | undefined): HighlightLanguage | null {
  const extension = getFileExtension(path);
  if (["ts", "tsx"].includes(extension)) {
    return "typescript";
  }
  if (["js", "jsx", "mjs", "cjs"].includes(extension)) {
    return "javascript";
  }
  if (extension === "json") {
    return "json";
  }
  if (["css", "scss", "less"].includes(extension)) {
    return "css";
  }
  if (["html", "htm", "xml", "svg"].includes(extension)) {
    return "xml";
  }
  if (["md", "mdx"].includes(extension)) {
    return "markdown";
  }
  if (["sh", "bash", "zsh"].includes(extension)) {
    return "bash";
  }
  if (extension === "rs") {
    return "rust";
  }
  if (extension === "py") {
    return "python";
  }
  return null;
}

function createCacheKey(content: string, language: HighlightLanguage | null): string {
  return `${language ?? "plain"}:${content}`;
}

export function highlightCodeLine(content: string, path?: string): string {
  if (content.trim().length === 0) {
    return content;
  }
  ensureLanguagesRegistered();
  const language = resolveHighlightLanguage(path);
  const cacheKey = createCacheKey(content, language);
  const cached = HIGHLIGHT_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let highlighted = escapeHtml(content);
  if (language !== null) {
    try {
      highlighted = hljs.highlight(content, { language, ignoreIllegals: true }).value;
    } catch {
      highlighted = escapeHtml(content);
    }
  }

  HIGHLIGHT_CACHE.set(cacheKey, highlighted);
  return highlighted;
}

export function HighlightedCodeContent(props: { readonly content: string; readonly path?: string; readonly className: string }): JSX.Element {
  return <code className={props.className} dangerouslySetInnerHTML={{ __html: highlightCodeLine(props.content, props.path) }} />;
}
