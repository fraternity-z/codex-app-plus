import type { AssistantTranscriptDetailPanel } from "../model/assistantTranscriptDetailModel";
import { TurnDiffSummaryList } from "./TurnDiffSummaryList";
import { HomeAssistantTranscriptFileDiffPanel } from "./HomeAssistantTranscriptFileDiffPanel";

interface HomeAssistantTranscriptDetailBlockProps {
  readonly panel: AssistantTranscriptDetailPanel;
}

export function HomeAssistantTranscriptDetailBlock(
  props: HomeAssistantTranscriptDetailBlockProps,
): JSX.Element {
  if (props.panel.variant === "diffSummary") {
    return <DiffSummaryPanel diffText={props.panel.body} />;
  }
  if (props.panel.variant === "fileDiff") {
    return (
      <HomeAssistantTranscriptFileDiffPanel
        changes={props.panel.changes}
      />
    );
  }

  const hasFooter = props.panel.footerMeta !== null || props.panel.footerStatus !== null;

  return (
    <div className="home-assistant-transcript-detail-panel" data-variant={props.panel.variant}>
      <div className="home-assistant-transcript-detail-header">
        <span className="home-assistant-transcript-detail-label">{props.panel.label}</span>
        {props.panel.topMeta ? (
          <span className="home-assistant-transcript-detail-top-meta">{props.panel.topMeta}</span>
        ) : null}
      </div>
      <div className="home-assistant-transcript-detail-scroll-shell">
        <div className="home-assistant-transcript-detail-scroll">
          <pre className="home-assistant-transcript-detail-body">{props.panel.body}</pre>
        </div>
      </div>
      {hasFooter ? (
        <div className="home-assistant-transcript-detail-footer">
          {props.panel.footerMeta ? (
            <span className="home-assistant-transcript-detail-footer-meta">{props.panel.footerMeta}</span>
          ) : null}
          {props.panel.footerStatus ? (
            <span className="home-assistant-transcript-detail-footer-status">{props.panel.footerStatus}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DiffSummaryPanel(props: { readonly diffText: string }): JSX.Element {
  return (
    <div className="home-assistant-transcript-detail-panel" data-variant="diffSummary">
      <TurnDiffSummaryList diffText={props.diffText} />
    </div>
  );
}
