import type { EmbeddedTerminalShell, HostBridge } from "../../../bridge/types";
import { OfficialCloseIcon } from "../../shared/ui/officialIcons";
import { useEmbeddedTerminal } from "../hooks/useEmbeddedTerminal";

interface TerminalPanelProps {
  readonly hostBridge: HostBridge;
  readonly open: boolean;
  readonly cwd: string | null;
  readonly cwdLabel: string;
  readonly shell: EmbeddedTerminalShell;
  readonly onClose: () => void;
}

export function TerminalPanel(props: TerminalPanelProps): JSX.Element {
  const terminal = useEmbeddedTerminal(props);

  return (
    <section className={terminal.className} aria-label="Terminal">
      <header className="terminal-toolbar">
        <div className="terminal-title">
          <span className="terminal-title-main">Terminal</span>
          <span className="terminal-title-sub">{terminal.subtitle}</span>
          <span className={`terminal-status terminal-status-${terminal.status}`}>{terminal.statusLabel}</span>
        </div>
        <div className="terminal-actions">
          {terminal.showRestartAction ? (
            <button type="button" className="terminal-action-btn" onClick={() => void terminal.openTerminal()}>
              Reopen
            </button>
          ) : null}
          <button type="button" className="terminal-close-btn" aria-label="Close terminal" onClick={props.onClose}>
            <OfficialCloseIcon className="terminal-close-icon" />
          </button>
        </div>
      </header>
      {terminal.errorMessage === null ? null : <div className="terminal-error">{terminal.errorMessage}</div>}
      <div className="terminal-body" onClick={terminal.focusTerminal}>
        <div ref={terminal.containerRef} className="terminal-surface" />
      </div>
    </section>
  );
}
