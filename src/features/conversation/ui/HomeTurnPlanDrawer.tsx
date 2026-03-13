import type { TurnPlanModel } from "../model/homeTurnPlanModel";
import { formatTurnPlanStatusLabel } from "../model/homeTurnPlanModel";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";

interface HomeTurnPlanDrawerProps {
  readonly plan: TurnPlanModel | null;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}

export function HomeTurnPlanDrawer(props: HomeTurnPlanDrawerProps): JSX.Element | null {
  if (props.plan === null) {
    return null;
  }

  const { entry, explanation, totalSteps, completedSteps } = props.plan;
  const isEmpty = entry.plan.length === 0;

  return (
    <section className="home-turn-plan-drawer" aria-label="任务清单">
      <button
        type="button"
        className="home-turn-plan-handle"
        data-expanded={props.collapsed ? undefined : "true"}
        onClick={props.onToggle}
      >
        <div className="home-turn-plan-handle-info">
          <span className="home-turn-plan-title">任务清单</span>
          <span className="home-turn-plan-progress">
            {isEmpty ? "任务已清空" : `已完成 ${completedSteps} / 共 ${totalSteps}`}
          </span>
        </div>
        <OfficialChevronRightIcon className="home-turn-plan-handle-icon" />
      </button>
      {props.collapsed ? null : (
        <div className="home-turn-plan-card">
          {explanation ? <p className="home-turn-plan-explanation">{explanation}</p> : null}
          <div className="home-turn-plan-summary">
            <span>共 {totalSteps} 个任务</span>
            <span>已完成 {completedSteps} 个</span>
          </div>
          {isEmpty ? (
            <p className="home-turn-plan-empty">任务已清空，等待新计划</p>
          ) : (
            <ol className="home-turn-plan-list">
              {entry.plan.map((step, index) => (
                <li key={`${entry.id}-${index}`} className="home-turn-plan-item" data-status={step.status}>
                  <span className="home-turn-plan-index">{index + 1}</span>
                  <span className="home-turn-plan-text">{step.step}</span>
                  <span className="home-turn-plan-status">{formatTurnPlanStatusLabel(step.status)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
