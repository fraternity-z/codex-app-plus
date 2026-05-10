import { Children, isValidElement, memo, useCallback, useMemo } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { highlightCodeLine } from "../../git/ui/diffCodeHighlight";
import type { ParsedFileLocation } from "../../../utils/fileLinks";
import {
  describeFileTarget,
  isFileLinkUrl,
  parseFileLinkUrl,
  parseInlineFileTarget,
  remarkFileLinks,
  resolveMessageFileHref,
  toFileLink,
} from "../utils/messageFileLinks";

type MarkdownVariant = "body" | "title";
type MarkdownRemarkPlugins = NonNullable<ComponentProps<typeof ReactMarkdown>["remarkPlugins"]>;
type MarkdownRehypePlugins = NonNullable<ComponentProps<typeof ReactMarkdown>["rehypePlugins"]>;

const BASE_MARKDOWN_REMARK_PLUGINS = [
  remarkGfm,
  remarkBreaks,
  remarkMath,
] as unknown as MarkdownRemarkPlugins;
const FILE_LINK_MARKDOWN_REMARK_PLUGINS = [
  remarkGfm,
  remarkBreaks,
  remarkMath,
  remarkFileLinks,
] as unknown as MarkdownRemarkPlugins;
const MARKDOWN_REHYPE_PLUGINS = [[rehypeKatex, { strict: "ignore" }]] as unknown as MarkdownRehypePlugins;

// 将 LLM 常用的 LaTeX 风格分隔符 (\[...\] / \(...\)) 归一化为
// remark-math 支持的 $$...$$ / $...$，避免原文显示为裸方括号。
const DISPLAY_MATH_RE = /\\\[([\s\S]+?)\\\]/g;
const INLINE_MATH_RE = /\\\(([\s\S]+?)\\\)/g;
const MARKDOWN_CODE_SEGMENT_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;
const CODE_LANGUAGE_CLASS_RE = /(?:^|\s)language-([^\s]+)/;

const CODE_BLOCK_LANGUAGE_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  bash: "sh",
  css: "css",
  html: "html",
  javascript: "js",
  js: "js",
  json: "json",
  jsx: "jsx",
  less: "less",
  markdown: "md",
  md: "md",
  mdx: "mdx",
  py: "py",
  python: "py",
  rs: "rs",
  rust: "rs",
  scss: "scss",
  sh: "sh",
  shell: "sh",
  svg: "svg",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  xml: "xml",
  zsh: "sh",
});

type CodeElement = ReactElement<{
  readonly children?: ReactNode;
  readonly className?: string;
}>;

type PositionedNode = {
  readonly position?: {
    readonly start: { readonly line: number };
    readonly end: { readonly line: number };
  };
};

function normalizeMathDelimiters(markdown: string): string {
  if (!markdown.includes("\\[") && !markdown.includes("\\(")) {
    return markdown;
  }
  return markdown
    .split(MARKDOWN_CODE_SEGMENT_RE)
    .map((segment, index) => {
      // 奇数下标是被保留的代码块/行内代码，保持原样。
      if (index % 2 === 1) {
        return segment;
      }
      return segment
        .replace(DISPLAY_MATH_RE, (_match, expression) => `\n\n$$\n${expression.trim()}\n$$\n\n`)
        .replace(INLINE_MATH_RE, (_match, expression) => `$${expression.trim()}$`);
    })
    .join("");
}

function isBlockCodeNode(node: PositionedNode | undefined): boolean {
  return node?.position !== undefined && node.position.start.line !== node.position.end.line;
}

function isCodeElement(node: ReactNode): node is CodeElement {
  return isValidElement<{ readonly children?: ReactNode; readonly className?: string }>(node);
}

function getOnlyCodeElement(children: ReactNode): CodeElement | null {
  const childArray = Children.toArray(children).filter(isCodeElement);
  if (childArray.length !== 1) {
    return null;
  }
  return childArray[0];
}

function getPlainTextFromReactNode(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (isValidElement<{ readonly children?: ReactNode }>(child)) {
        return getPlainTextFromReactNode(child.props.children);
      }
      return "";
    })
    .join("");
}

function normalizeCodeBlockText(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

function getCodeBlockLanguage(className: string | undefined): string | null {
  const match = className?.match(CODE_LANGUAGE_CLASS_RE);
  return match?.[1]?.toLowerCase() ?? null;
}

function getCodeBlockHighlightPath(language: string | null): string | undefined {
  if (language === null) {
    return undefined;
  }
  const extension = CODE_BLOCK_LANGUAGE_EXTENSIONS[language];
  return extension === undefined ? undefined : `snippet.${extension}`;
}

interface MarkdownRendererProps {
  readonly className?: string;
  readonly enableFileLinks?: boolean;
  readonly markdown: string;
  readonly variant?: MarkdownVariant;
  readonly workspacePath?: string | null;
  readonly onOpenFileLink?: (path: ParsedFileLocation) => void;
  readonly onOpenFileLinkMenu?: (event: React.MouseEvent, path: ParsedFileLocation) => void;
  readonly onOpenExternalLink?: (url: string) => void;
}

function FileReferenceLink({
  href,
  rawPath,
  showFilePath,
  workspacePath,
  onClick,
  onContextMenu,
}: {
  href: string;
  rawPath: ParsedFileLocation;
  showFilePath: boolean;
  workspacePath?: string | null;
  onClick: (event: React.MouseEvent, path: ParsedFileLocation) => void;
  onContextMenu: (event: React.MouseEvent, path: ParsedFileLocation) => void;
}) {
  const { fullPath, fileName, lineLabel, parentPath } = describeFileTarget(rawPath, workspacePath);
  return (
    <a
      href={href}
      className="message-file-link"
      title={fullPath}
      onClick={(event) => onClick(event, rawPath)}
      onContextMenu={(event) => onContextMenu(event, rawPath)}
    >
      <span className="message-file-link-label">
        <span className="message-file-link-name">{fileName}</span>
        {lineLabel ? <span className="message-file-link-line"> (line {lineLabel})</span> : null}
      </span>
      {showFilePath && parentPath ? (
        <span className="message-file-link-path">{parentPath}</span>
      ) : null}
    </a>
  );
}

function MarkdownCodeBlock(props: { readonly children: ReactNode; readonly className?: string }): JSX.Element {
  const language = getCodeBlockLanguage(props.className);
  const codeText = useMemo(() => normalizeCodeBlockText(getPlainTextFromReactNode(props.children)), [props.children]);
  const highlightedHtml = useMemo(
    () => highlightCodeLine(codeText, getCodeBlockHighlightPath(language)),
    [codeText, language],
  );
  const codeClassName = props.className === undefined
    ? "home-chat-code-block-code"
    : `home-chat-code-block-code ${props.className}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(codeText);
    } catch {
      // Clipboard writes may be unavailable in restricted webviews.
    }
  }, [codeText]);

  return (
    <div className="home-chat-code-block">
      <div className="home-chat-code-block-header">
        {language === null ? <span aria-hidden="true" /> : <span className="home-chat-code-block-language">{language}</span>}
        <button type="button" className="home-chat-code-block-copy" aria-label="Copy code" title="Copy code" onClick={handleCopy}>
          <span className="home-chat-code-block-copy-icon" aria-hidden="true" />
        </button>
      </div>
      <pre className="home-chat-code-block-pre">
        <code className={codeClassName} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      </pre>
    </div>
  );
}

export const MarkdownRenderer = memo(function MarkdownRenderer(props: MarkdownRendererProps): JSX.Element {
  const { workspacePath = null, onOpenFileLink, onOpenFileLinkMenu, onOpenExternalLink } = props;
  const canOpenFileLinks = props.enableFileLinks !== false && onOpenFileLink !== undefined;

  const handleFileLinkClick = useCallback((event: React.MouseEvent, path: ParsedFileLocation) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenFileLink?.(path);
  }, [onOpenFileLink]);

  const handleFileLinkContextMenu = useCallback((
    event: React.MouseEvent,
    path: ParsedFileLocation,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenFileLinkMenu?.(event, path);
  }, [onOpenFileLinkMenu]);

  const handleLocalLinkClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const resolvedHrefFilePathCache = useMemo(() => new Map<string, ParsedFileLocation | null>(), [props.markdown, workspacePath]);
  const resolveHrefFilePath = useCallback((url: string) => {
    if (!canOpenFileLinks) {
      return null;
    }
    if (resolvedHrefFilePathCache.has(url)) {
      return resolvedHrefFilePathCache.get(url) ?? null;
    }
    const resolvedPath = resolveMessageFileHref(url, workspacePath);
    if (!resolvedPath) {
      resolvedHrefFilePathCache.set(url, null);
      return null;
    }
    resolvedHrefFilePathCache.set(url, resolvedPath);
    return resolvedPath;
  }, [canOpenFileLinks, resolvedHrefFilePathCache, workspacePath]);

  const components: Components = useMemo(() => {
    const nextComponents: Components = {
      a: ({ href, children }) => {
        const url = (href ?? "").trim();

        if (canOpenFileLinks && isFileLinkUrl(url)) {
          const path = parseFileLinkUrl(url);
          if (!path) {
            return (
              <a href={href} onClick={handleLocalLinkClick}>
                {children}
              </a>
            );
          }
          return (
            <FileReferenceLink
              href={href ?? toFileLink(path)}
              rawPath={path}
              showFilePath={false}
              workspacePath={workspacePath}
              onClick={handleFileLinkClick}
              onContextMenu={handleFileLinkContextMenu}
            />
          );
        }

        const hrefFilePath = canOpenFileLinks ? resolveHrefFilePath(url) : null;
        if (hrefFilePath) {
          return (
            <FileReferenceLink
              href={href ?? toFileLink(hrefFilePath)}
              rawPath={hrefFilePath}
              showFilePath={false}
              workspacePath={workspacePath}
              onClick={handleFileLinkClick}
              onContextMenu={handleFileLinkContextMenu}
            />
          );
        }

        const isExternal =
          url.startsWith("http://") ||
          url.startsWith("https://") ||
          url.startsWith("mailto:");

        if (!isExternal) {
          if (url.startsWith("#")) {
            return <a href={href}>{children}</a>;
          }
          return <strong className="message-local-reference">{children}</strong>;
        }

        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={onOpenExternalLink ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenExternalLink(url);
            } : undefined}
          >
            {children}
          </a>
        );
      },
      code: ({ node, className: codeClassName, children }) => {
        if (codeClassName || isBlockCodeNode(node)) {
          return <code className={codeClassName}>{children}</code>;
        }
        if (!canOpenFileLinks) {
          return <code>{children}</code>;
        }
        const text = String(children ?? "").trim();
        const fileTarget = parseInlineFileTarget(text);
        if (!fileTarget) {
          return <code>{children}</code>;
        }
        const href = toFileLink(fileTarget);
        return (
          <FileReferenceLink
            href={href}
            rawPath={fileTarget}
            showFilePath={false}
            workspacePath={workspacePath}
            onClick={handleFileLinkClick}
            onContextMenu={handleFileLinkContextMenu}
          />
        );
      },
      pre: ({ children }) => {
        const codeElement = getOnlyCodeElement(children);
        if (codeElement === null) {
          return <pre>{children}</pre>;
        }
        return <MarkdownCodeBlock className={codeElement.props.className}>{codeElement.props.children}</MarkdownCodeBlock>;
      },
    };

    if (props.variant === "title") {
      nextComponents.p = ({ node: _node, ...pProps }) => <span {...pProps} />;
    }

    return nextComponents;
  }, [canOpenFileLinks, handleFileLinkClick, handleFileLinkContextMenu, handleLocalLinkClick, onOpenExternalLink, onOpenFileLinkMenu, props.variant, resolveHrefFilePath, workspacePath]);

  const remarkPlugins = canOpenFileLinks ? FILE_LINK_MARKDOWN_REMARK_PLUGINS : BASE_MARKDOWN_REMARK_PLUGINS;
  const normalizedMarkdown = useMemo(() => normalizeMathDelimiters(props.markdown), [props.markdown]);
  const urlTransform = useMemo(() => (url: string) => {
    if (resolveHrefFilePath(url)) {
      return url;
    }
    if (
      (canOpenFileLinks && isFileLinkUrl(url)) ||
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("mailto:") ||
      url.startsWith("#") ||
      url.startsWith("/") ||
      url.startsWith("./") ||
      url.startsWith("../")
    ) {
      return url;
    }
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
    if (!hasScheme) {
      return url;
    }
    return "";
  }, [canOpenFileLinks, resolveHrefFilePath]);

  const content = (
    <ReactMarkdown
      components={components}
      remarkPlugins={remarkPlugins}
      rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
      urlTransform={urlTransform}
    >
      {normalizedMarkdown}
    </ReactMarkdown>
  );

  if (props.className === undefined) {
    return content;
  }

  return props.variant === "title" ? <span className={props.className}>{content}</span> : <div className={props.className}>{content}</div>;
});
