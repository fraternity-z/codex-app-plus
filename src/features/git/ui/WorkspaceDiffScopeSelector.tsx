import { useCallback, useMemo, useRef, useState } from "react";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";
import type { GitChangeScope, GitChangeScopeOption } from "./GitChangeBrowser";

interface WorkspaceDiffScopeSelectorProps {
  readonly options: ReadonlyArray<GitChangeScopeOption>;
  readonly selectedScope: GitChangeScope;
  readonly onChange: (scope: GitChangeScope) => void;
}

function getSelectedOption(options: ReadonlyArray<GitChangeScopeOption>, selectedScope: GitChangeScope): GitChangeScopeOption {
  return options.find((option) => option.scope === selectedScope) ?? options[0] ?? { scope: "unstaged", label: "未暂存", count: 0 };
}

function ChevronIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3.8 8.2 2.5 2.5 5.9-5.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WorkspaceDiffScopeSelector(props: WorkspaceDiffScopeSelectorProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = useMemo(() => getSelectedOption(props.options, props.selectedScope), [props.options, props.selectedScope]);
  const closeMenu = useCallback(() => setOpen(false), []);

  useToolbarMenuDismissal(open, containerRef, closeMenu);

  return (
    <div className={open ? "workspace-diff-scope workspace-diff-scope-open" : "workspace-diff-scope"} ref={containerRef}>
      <button type="button" className="workspace-diff-scope-trigger" aria-haspopup="menu" aria-expanded={open} aria-label="选择差异分组" onClick={() => setOpen((value) => !value)}>
        <span className="workspace-diff-scope-label">{selectedOption.label}</span>
        <span className="workspace-diff-scope-count">{selectedOption.count}</span>
        <ChevronIcon className="workspace-diff-scope-chevron" />
      </button>
      {open ? (
        <div className="workspace-diff-scope-menu" role="menu" aria-label="差异分组">
          {props.options.map((option) => (
            <button
              key={option.scope}
              type="button"
              className="workspace-diff-scope-option"
              role="menuitemradio"
              aria-checked={option.scope === props.selectedScope}
              onClick={() => {
                props.onChange(option.scope);
                closeMenu();
              }}
            >
              <div className="workspace-diff-scope-option-main">
                <span className="workspace-diff-scope-option-label">{option.label}</span>
                <span className="workspace-diff-scope-option-count">{option.count}</span>
              </div>
              {option.scope === props.selectedScope ? <CheckIcon className="workspace-diff-scope-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
