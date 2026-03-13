import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

type MarkdownVariant = "body" | "title";
type MarkdownRemarkPlugins = NonNullable<ComponentProps<typeof ReactMarkdown>["remarkPlugins"]>;

const BASE_MARKDOWN_COMPONENTS = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
} satisfies Components;

const TITLE_MARKDOWN_COMPONENTS = {
  ...BASE_MARKDOWN_COMPONENTS,
  p: ({ node: _node, ...props }) => <span {...props} />,
} satisfies Components;

const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkBreaks] as unknown as MarkdownRemarkPlugins;

interface MarkdownRendererProps {
  readonly className?: string;
  readonly markdown: string;
  readonly variant?: MarkdownVariant;
}

export function MarkdownRenderer(props: MarkdownRendererProps): JSX.Element {
  const content = (
    <ReactMarkdown components={getMarkdownComponents(props.variant)} remarkPlugins={MARKDOWN_REMARK_PLUGINS}>
      {props.markdown}
    </ReactMarkdown>
  );

  if (props.className === undefined) {
    return content;
  }

  return props.variant === "title" ? <span className={props.className}>{content}</span> : <div className={props.className}>{content}</div>;
}

function getMarkdownComponents(variant: MarkdownVariant | undefined): Components {
  return variant === "title" ? TITLE_MARKDOWN_COMPONENTS : BASE_MARKDOWN_COMPONENTS;
}
