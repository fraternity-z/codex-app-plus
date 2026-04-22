import { useEffect, useRef, type RefObject } from "react";

export interface SkillBadgeMatch {
  readonly name: string;
  readonly raw: string;
  readonly endIndex: number;
}

const SKILL_COMMAND_PATTERN = /^\$([^\s$]+)\s/;

export function detectSkillBadge(text: string, paletteOpen: boolean): SkillBadgeMatch | null {
  if (paletteOpen) {
    return null;
  }
  const match = text.match(SKILL_COMMAND_PATTERN);
  if (match === null || !match[1]) {
    return null;
  }
  const raw = `$${match[1]}`;
  return { name: match[1], raw, endIndex: raw.length };
}

interface ComposerSkillBadgeOverlayProps {
  readonly text: string;
  readonly match: SkillBadgeMatch;
  readonly textareaRef: RefObject<HTMLTextAreaElement>;
}

export function ComposerSkillBadgeOverlay({ text, match, textareaRef }: ComposerSkillBadgeOverlayProps): JSX.Element {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    const layer = layerRef.current;
    if (textarea === null || layer === null) {
      return;
    }
    const sync = () => {
      layer.scrollTop = textarea.scrollTop;
    };
    textarea.addEventListener("scroll", sync);
    sync();
    return () => textarea.removeEventListener("scroll", sync);
  }, [textareaRef]);

  return (
    <div ref={layerRef} className="composer-skill-badge-layer" aria-hidden="true">
      <span className="composer-skill-badge">{match.raw}</span>
      {text.slice(match.endIndex)}
    </div>
  );
}
