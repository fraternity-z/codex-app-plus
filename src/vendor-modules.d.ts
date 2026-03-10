declare module "remark-gfm" {
  const remarkGfm: unknown;
  export default remarkGfm;
}

declare module "highlight.js/lib/core" {
  interface HighlightResult {
    readonly value: string;
  }
  interface Hljs {
    registerLanguage(name: string, language: unknown): void;
    highlight(value: string, options: { language: string; ignoreIllegals?: boolean }): HighlightResult;
  }
  const hljs: Hljs;
  export default hljs;
}

declare module "highlight.js/lib/languages/*" {
  const language: unknown;
  export default language;
}
