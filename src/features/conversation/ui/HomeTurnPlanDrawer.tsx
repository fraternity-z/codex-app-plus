import type { TurnPlanBackgroundTask, TurnPlanModel, TurnPlanOverview } from "../model/homeTurnPlanModel";
import { formatTurnPlanStatusLabel } from "../model/homeTurnPlanModel";
import type { WorkspaceGitController } from "../../git/model/types";
import { GitOperationsMenu } from "../../git/ui/GitOperationsMenu";
import { GitBranchIcon, GitHubMarkIcon } from "../../git/ui/gitIcons";
import { useI18n } from "../../../i18n/useI18n";
import type { TurnPlanStep } from "../../../protocol/generated/v2/TurnPlanStep";

interface HomeTurnPlanDrawerProps {
  readonly plan: TurnPlanModel | null;
  readonly overview?: TurnPlanOverview;
  readonly pinned: boolean;
  readonly showProgress?: boolean;
  readonly visible: boolean;
  readonly gitController?: WorkspaceGitController;
  readonly onOpenDiff?: () => void;
  readonly onSelectThread?: (threadId: string) => void;
}

export function HomeTurnPlanDrawer(props: HomeTurnPlanDrawerProps): JSX.Element | null {
  const { t } = useI18n();
  if (!props.visible) {
    return null;
  }

  const plan = props.plan;
  const showProgress = props.showProgress ?? true;
  const isEmpty = plan !== null && plan.entry.plan.length === 0;
  const planState = createPlanState(plan, isEmpty);
  const progressSummary = plan === null
    ? t("home.turnPlan.waitingStatus")
    : isEmpty
      ? t("home.turnPlan.cleared")
      : t("home.turnPlan.completedSummary", { completed: plan.completedSteps, total: plan.totalSteps });

  return (
    <section
      className={props.pinned ? "home-turn-plan-drawer home-turn-progress-card home-turn-progress-card-pinned" : "home-turn-plan-drawer home-turn-progress-card"}
      data-plan-state={planState}
      aria-label={t("home.turnPlan.progressCardLabel")}
    >
      <div className={showProgress ? "home-turn-progress-card-surface" : "home-turn-progress-card-surface home-turn-progress-card-surface-compact"}>
        {showProgress ? (
          <>
            <header className="home-turn-progress-header">
              <div className="home-turn-progress-heading">
                <h2>{t("home.turnPlan.progressTitle")}</h2>
                <span>{progressSummary}</span>
              </div>
            </header>
            <section className="home-turn-progress-section" aria-label={t("home.turnPlan.progressTitle")}>
              {plan?.explanation ? <p className="home-turn-plan-explanation">{plan.explanation}</p> : null}
              {plan === null ? (
                <p className="home-turn-plan-empty">{t("home.turnPlan.waiting")}</p>
              ) : isEmpty ? (
                <p className="home-turn-plan-empty">{t("home.turnPlan.empty")}</p>
              ) : (
                <ol className="home-turn-progress-list">
                  {plan.entry.plan.map((step, index) => (
                    <li
                      key={`${plan.entry.id}-${index}-${step.status}`}
                      className="home-turn-progress-step"
                      data-status={step.status}
                      aria-label={`${step.step}: ${formatTurnPlanStatusLabel(step.status, t)}`}
                    >
                      <PlanStepMarker status={step.status} />
                      <span className="home-turn-progress-step-text">{step.step}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <div className="home-turn-progress-divider" />
          </>
        ) : null}
        <OverviewSections
          gitController={props.gitController}
          onOpenDiff={props.onOpenDiff}
          onSelectThread={props.onSelectThread}
          overview={props.overview}
        />
      </div>
    </section>
  );
}

function createPlanState(plan: TurnPlanModel | null, isEmpty: boolean): "active" | "complete" | "cleared" | "waiting" {
  if (plan === null) {
    return "waiting";
  }
  if (isEmpty) {
    return "cleared";
  }
  return plan.completedSteps === plan.totalSteps ? "complete" : "active";
}

function PlanStepMarker(props: { readonly status: TurnPlanStep["status"] }): JSX.Element {
  return (
    <span className="home-turn-progress-step-marker" data-status={props.status} aria-hidden="true">
      <span className="home-turn-progress-step-check" />
    </span>
  );
}

function OverviewSections(props: {
  readonly gitController?: WorkspaceGitController;
  readonly onOpenDiff?: () => void;
  readonly onSelectThread?: (threadId: string) => void;
  readonly overview?: TurnPlanOverview;
}): JSX.Element {
  const { t } = useI18n();
  const overview = props.overview ?? {
    additions: null,
    backgroundTasks: [],
    changedFiles: 0,
    deletions: null,
    generatedImages: 0,
  };

  return (
    <>
      <section className="home-turn-progress-section" aria-label={t("home.turnPlan.branchDetails")}>
        <h3>{t("home.turnPlan.branchDetails")}</h3>
        <OverviewRow
          actionLabel={t("home.turnPlan.changes")}
          icon={<ChangeIcon className="home-turn-progress-row-icon" />}
          label={t("home.turnPlan.changes")}
          onClick={props.onOpenDiff}
        >
          <ChangeSummary overview={overview} />
        </OverviewRow>
        {props.gitController === undefined ? (
          <OverviewRow icon={<GitBranchIcon className="home-turn-progress-row-icon" />} label={t("home.turnPlan.gitOperation")} />
        ) : (
          <GitOperationsMenu
            controller={props.gitController}
            triggerLabel={t("home.turnPlan.gitOperation")}
            triggerClassName="home-turn-progress-row home-turn-progress-row-action"
            activeTriggerClassName="home-turn-progress-row home-turn-progress-row-action home-turn-progress-row-action-active"
            wrapperClassName="home-turn-progress-menu-wrap"
            menuClassName="workspace-diff-actions-menu workspace-diff-git-menu home-turn-progress-git-menu"
            triggerChildren={(
              <>
                <GitBranchIcon className="home-turn-progress-row-icon" />
                <span className="home-turn-progress-row-label">{t("home.turnPlan.gitOperation")}</span>
              </>
            )}
          />
        )}
        <OverviewRow
          muted
          icon={<GitHubMarkIcon className="home-turn-progress-row-icon" />}
          label={t("home.turnPlan.githubCliUnauthenticated")}
        />
      </section>
      {overview.backgroundTasks.length > 0 ? (
        <>
          <div className="home-turn-progress-divider" />
          <section className="home-turn-progress-section" aria-label={t("home.turnPlan.backgroundTasks")}>
            <h3>{t("home.turnPlan.backgroundTasks")}</h3>
            <div className="home-turn-background-task-list">
              {overview.backgroundTasks.map((task) => (
                <BackgroundTaskRow key={task.id} task={task} onSelectThread={props.onSelectThread} />
              ))}
            </div>
          </section>
        </>
      ) : null}
      <div className="home-turn-progress-divider" />
      <section className="home-turn-progress-section" aria-label={t("home.turnPlan.generatedResults")}>
        <h3>{t("home.turnPlan.generatedResults")}</h3>
        <OverviewRow icon={<ImageResultIcon className="home-turn-progress-row-icon" />} label={formatGeneratedImages(overview.generatedImages, t)} />
      </section>
    </>
  );
}

function BackgroundTaskRow(props: {
  readonly onSelectThread?: (threadId: string) => void;
  readonly task: TurnPlanBackgroundTask;
}): JSX.Element {
  const { t } = useI18n();
  const task = props.task;
  const content = (
    <>
      <span className="home-turn-background-task-spinner" aria-hidden="true" />
      <span className="home-turn-background-task-copy">
        <span className="home-turn-background-task-label">{task.label}</span>
        {task.kind === "subagent" && task.detail !== null ? (
          <span className="home-turn-background-task-detail"> ({task.detail})</span>
        ) : null}
      </span>
    </>
  );

  if (task.kind === "subagent" && props.onSelectThread !== undefined) {
    const threadLabel = t("home.conversation.transcript.subagents.openThreadAria", { label: task.label });
    return (
      <button
        type="button"
        className="home-turn-background-task-row home-turn-background-task-row-action"
        aria-label={threadLabel}
        title={threadLabel}
        onClick={() => props.onSelectThread?.(task.threadId)}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="home-turn-background-task-row" title={task.label}>
      {content}
    </div>
  );
}

function OverviewRow(props: {
  readonly actionLabel?: string;
  readonly children?: JSX.Element | null;
  readonly icon: JSX.Element;
  readonly label: string;
  readonly muted?: boolean;
  readonly onClick?: () => void;
}): JSX.Element {
  const className = props.muted === true
    ? "home-turn-progress-row home-turn-progress-row-muted"
    : props.onClick === undefined
      ? "home-turn-progress-row"
      : "home-turn-progress-row home-turn-progress-row-action";
  const content = (
    <>
      {props.icon}
      <span className="home-turn-progress-row-label">{props.label}</span>
      {props.children ?? null}
    </>
  );
  if (props.onClick !== undefined) {
    return (
      <button
        type="button"
        className={className}
        aria-label={props.actionLabel ?? props.label}
        onClick={props.onClick}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={className}>
      {content}
    </div>
  );
}

function ChangeSummary(props: { readonly overview: TurnPlanOverview }): JSX.Element {
  const { t } = useI18n();
  if (props.overview.additions !== null && props.overview.deletions !== null) {
    return (
      <span className="home-turn-progress-change-counts" aria-label={t("home.turnPlan.changeCounts", { additions: props.overview.additions, deletions: props.overview.deletions })}>
        <span className="home-turn-progress-change-add">+{props.overview.additions}</span>
        <span className="home-turn-progress-change-delete">-{props.overview.deletions}</span>
      </span>
    );
  }
  return (
    <span className="home-turn-progress-row-value">
      {props.overview.changedFiles > 0
        ? t("home.turnPlan.changedFiles", { count: props.overview.changedFiles })
        : t("home.turnPlan.noChanges")}
    </span>
  );
}

function formatGeneratedImages(count: number, t: ReturnType<typeof useI18n>["t"]): string {
  if (count === 0) {
    return t("home.turnPlan.noGeneratedResults");
  }
  return t("home.turnPlan.generatedImages", { count });
}

function ChangeIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 7.1v5.8M7.1 10h5.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ImageResultIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.8" y="4" width="12.4" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7.3" cy="7.6" r="1.15" fill="currentColor" />
      <path d="m5.2 13.5 3.05-3.2 2.25 2.25 1.3-1.4 3 3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
