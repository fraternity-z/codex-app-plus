import { useEffect, useState } from "react";
import type { ConversationMessage } from "../../../domain/timeline";
import { useI18n } from "../../../i18n";
import {
  extractQuickPreviewTargets,
  type QuickPreviewTarget,
} from "../../preview/model/previewTargets";
import { useFileLinkActions } from "../hooks/fileLinkContext";
import { SidebarIcon } from "../../shared/ui/icons";

interface ConversationQuickOpenCardsProps {
  readonly message: ConversationMessage;
}

const MAX_QUICK_OPEN_CARDS = 3;
const MAX_QUICK_OPEN_CANDIDATES = 12;

function getTargetKey(target: QuickPreviewTarget): string {
  return target.kind === "website"
    ? `website:${target.url}`
    : `file:${target.path}`;
}

function getTargetTitle(target: QuickPreviewTarget): string {
  return target.kind === "website" ? "网页预览" : target.name;
}

function getTargetSubtitle(target: QuickPreviewTarget): string {
  if (target.kind === "website") {
    return "网站";
  }
  const prefix = target.fileKind === "image" ? "图片" : "文档";
  return target.extension.length > 0 ? `${prefix} · ${target.extension}` : prefix;
}

function QuickOpenIcon(props: { readonly target: QuickPreviewTarget }): JSX.Element {
  if (props.target.kind === "website") {
    return (
      <span className="conversation-quick-open-icon conversation-quick-open-icon-website" aria-hidden="true">
        <SidebarIcon kind="browser" />
      </span>
    );
  }

  const label = props.target.fileKind === "image" ? "IMG" : props.target.extension || "DOC";
  return (
    <span
      className={`conversation-quick-open-icon conversation-quick-open-icon-${props.target.fileKind}`}
      aria-hidden="true"
    >
      <span>{label.slice(0, 4)}</span>
    </span>
  );
}

async function resolveAvailableTargets(
  candidates: ReadonlyArray<QuickPreviewTarget>,
  isPreviewFileAvailable: ((path: string) => Promise<boolean>) | undefined,
): Promise<ReadonlyArray<QuickPreviewTarget>> {
  const availableTargets: QuickPreviewTarget[] = [];

  for (const candidate of candidates) {
    if (availableTargets.length >= MAX_QUICK_OPEN_CARDS) {
      break;
    }
    if (candidate.kind === "website") {
      availableTargets.push(candidate);
      continue;
    }
    if (isPreviewFileAvailable === undefined) {
      continue;
    }
    try {
      if (await isPreviewFileAvailable(candidate.path)) {
        availableTargets.push(candidate);
      }
    } catch {
      // Missing or inaccessible files are ignored; quick-open cards should only
      // advertise targets that can actually be opened.
    }
  }

  return availableTargets;
}

export function ConversationQuickOpenCards(props: ConversationQuickOpenCardsProps): JSX.Element | null {
  const { t } = useI18n();
  const actions = useFileLinkActions();
  const [targets, setTargets] = useState<ReadonlyArray<QuickPreviewTarget>>([]);

  useEffect(() => {
    if (actions?.openPreviewTarget === undefined || props.message.status !== "done") {
      setTargets([]);
      return undefined;
    }

    let cancelled = false;
    setTargets([]);
    const candidates = extractQuickPreviewTargets(
      props.message.text,
      actions.workspacePath,
      MAX_QUICK_OPEN_CANDIDATES,
    );
    void resolveAvailableTargets(candidates, actions.isPreviewFileAvailable).then((availableTargets) => {
      if (!cancelled) {
        setTargets(availableTargets);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    actions?.isPreviewFileAvailable,
    actions?.openPreviewTarget,
    actions?.workspacePath,
    props.message.status,
    props.message.text,
  ]);

  if (actions?.openPreviewTarget === undefined || targets.length === 0) {
    return null;
  }

  return (
    <div className="conversation-quick-open-cards" role="list" aria-label={t("home.conversation.quickOpen.label")}>
      {targets.map((target) => {
        const title = getTargetTitle(target);
        return (
          <article key={getTargetKey(target)} className="conversation-quick-open-card" role="listitem">
            <QuickOpenIcon target={target} />
            <span className="conversation-quick-open-copy">
              <span className="conversation-quick-open-title">{title}</span>
              <span className="conversation-quick-open-subtitle">{getTargetSubtitle(target)}</span>
            </span>
            <button
              type="button"
              className="conversation-quick-open-button"
              aria-label={t("home.conversation.quickOpen.openTarget", { title })}
              onClick={() => actions.openPreviewTarget?.(target)}
            >
              {t("home.conversation.quickOpen.open")}
            </button>
          </article>
        );
      })}
    </div>
  );
}
