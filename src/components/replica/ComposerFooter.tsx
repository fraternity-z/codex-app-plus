import { useMemo, useState } from "react";
import type { WorkspaceGitController } from "./git/types";
import { ComposerFooterBranchPopover } from "./ComposerFooterBranchPopover";
import { permissionLabel, PermissionsPopover, type PermissionLevel, WorkspacePopover } from "./ComposerFooterPopovers";
import { OfficialAlertCircleIcon, OfficialChevronRightIcon, OfficialWorktreeIcon } from "./officialIcons";

type FooterPopover = "workspace" | "permissions" | "branch" | null;

const TEXT = {
  chooseBranch: "\u9009\u62e9\u5206\u652f",
  closeMenu: "\u5173\u95ed\u83dc\u5355",
  local: "\u672c\u5730",
};

function getCurrentBranchLabel(controller: WorkspaceGitController): string | null {
  if (controller.status?.branch?.detached) {
    return "Detached HEAD";
  }
  return controller.status?.branches.find((branch) => branch.isCurrent)?.name ?? controller.status?.branch?.head ?? null;
}

function getBranchLabel(controller: WorkspaceGitController, selectedThreadBranch: string | null): string {
  const branches = controller.status?.branches ?? [];
  if (selectedThreadBranch !== null && branches.some((branch) => branch.name === selectedThreadBranch)) {
    return selectedThreadBranch;
  }
  return (getCurrentBranchLabel(controller) ?? controller.selectedBranch) || TEXT.chooseBranch;
}

function PopoverBackdrop(props: { readonly onClick: () => void }): JSX.Element {
  return <button type="button" className="composer-popover-backdrop composer-footer-popover-backdrop" onClick={props.onClick} aria-label={TEXT.closeMenu} />;
}

function WorkspaceFooterButton(props: { readonly active: boolean; readonly onToggle: () => void; readonly onClose: () => void }): JSX.Element {
  return (
    <div className="composer-footer-anchor">
      {props.active ? <WorkspacePopover onClose={props.onClose} /> : null}
      <button type="button" className={props.active ? "composer-footer-item composer-footer-item-active" : "composer-footer-item"} onClick={props.onToggle} aria-haspopup="menu" aria-expanded={props.active}>
        <span className="footer-icon" aria-hidden="true">{"\u2302"}</span>
        {TEXT.local} <OfficialChevronRightIcon className="footer-caret" />
      </button>
    </div>
  );
}

function PermissionsFooterButton(props: {
  readonly active: boolean;
  readonly selected: PermissionLevel;
  readonly onToggle: () => void;
  readonly onSelect: (level: PermissionLevel) => void;
}): JSX.Element {
  const baseClassName = props.selected === "full" ? "composer-footer-item footer-warning" : "composer-footer-item";
  const className = props.active ? `${baseClassName} composer-footer-item-active` : baseClassName;
  return (
    <div className="composer-footer-anchor">
      {props.active ? <PermissionsPopover selected={props.selected} onSelect={props.onSelect} /> : null}
      <button type="button" className={className} onClick={props.onToggle} aria-haspopup="menu" aria-expanded={props.active}>
        <OfficialAlertCircleIcon className="footer-alert-icon" />
        {permissionLabel(props.selected)} <OfficialChevronRightIcon className="footer-caret" />
      </button>
    </div>
  );
}

function BranchFooterButton(props: {
  readonly active: boolean;
  readonly controller: WorkspaceGitController;
  readonly selectedThreadId: string | null;
  readonly selectedThreadBranch: string | null;
  readonly onToggle: () => void;
  readonly onClose: () => void;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
}): JSX.Element {
  const label = useMemo(() => getBranchLabel(props.controller, props.selectedThreadBranch), [props.controller, props.selectedThreadBranch]);
  return (
    <div className="composer-footer-anchor composer-footer-anchor-right">
      {props.active ? <ComposerFooterBranchPopover controller={props.controller} selectedThreadId={props.selectedThreadId} selectedThreadBranch={props.selectedThreadBranch} onUpdateThreadBranch={props.onUpdateThreadBranch} onClose={props.onClose} /> : null}
      <button type="button" className={props.active ? "composer-footer-item composer-footer-item-active" : "composer-footer-item"} onClick={props.onToggle} aria-haspopup="menu" aria-expanded={props.active}>
        <OfficialWorktreeIcon className="footer-branch-icon" />
        {label} <OfficialChevronRightIcon className="footer-caret" />
      </button>
    </div>
  );
}

export function ComposerFooter(props: {
  readonly permissionLevel: PermissionLevel;
  readonly gitController: WorkspaceGitController;
  readonly selectedThreadId: string | null;
  readonly selectedThreadBranch: string | null;
  readonly onSelectPermission: (level: PermissionLevel) => void;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
}): JSX.Element {
  const [openPopover, setOpenPopover] = useState<FooterPopover>(null);
  const footerClassName = openPopover === null ? "composer-footer" : "composer-footer composer-footer-popover-open";
  const closePopover = () => setOpenPopover(null);
  const togglePopover = (target: Exclude<FooterPopover, null>) => setOpenPopover((current) => current === target ? null : target);
  const handleSelectPermission = (level: PermissionLevel) => {
    props.onSelectPermission(level);
    closePopover();
  };

  return (
    <div className={footerClassName}>
      {openPopover ? <PopoverBackdrop onClick={closePopover} /> : null}
      <div className="composer-footer-left">
        <WorkspaceFooterButton active={openPopover === "workspace"} onToggle={() => togglePopover("workspace")} onClose={closePopover} />
        <PermissionsFooterButton active={openPopover === "permissions"} selected={props.permissionLevel} onToggle={() => togglePopover("permissions")} onSelect={handleSelectPermission} />
      </div>
      <BranchFooterButton active={openPopover === "branch"} controller={props.gitController} selectedThreadId={props.selectedThreadId} selectedThreadBranch={props.selectedThreadBranch} onToggle={() => togglePopover("branch")} onClose={closePopover} onUpdateThreadBranch={props.onUpdateThreadBranch} />
    </div>
  );
}
