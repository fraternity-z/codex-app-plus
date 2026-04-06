import type { TurnPlanModel } from "../model/homeTurnPlanModel";
import { formatTurnPlanStatusLabel } from "../model/homeTurnPlanModel";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import { useI18n } from "../../../i18n/useI18n";

interface HomeTurnPlanDrawerProps {
  readonly plan: TurnPlanModel | null;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}

export function HomeTurnPlanDrawer(props: HomeTurnPlanDrawerProps): JSX.Element | null {
  const { t } = useI18n();
  if (props.plan === null) {
    return null;
  }

  const { entry, explanation, totalSteps, completedSteps } = props.plan;
  const isEmpty = entry.plan.length === 0;

  return (
    <section className="home-turn-plan-drawer" aria-label={t("home.turnPlan.title")}>
      <button
        type="button"
        className="home-turn-plan-handle"
        data-expanded={props.collapsed ? undefined : "true"}
        onClick={props.onToggle}
      >
        <div className="home-turn-plan-handle-info">
          <span className="home-turn-plan-title">{t("home.turnPlan.title")}</span>
          <span className="home-turn-plan-progress">
            {isEmpty
              ? t("home.turnPlan.cleared")
              : t("home.turnPlan.completedSummary", { completed: completedSteps, total: totalSteps })}
          </span>
        </div>
        <OfficialChevronRightIcon className="home-turn-plan-handle-icon" />
      </button>
      {props.collapsed ? null : (
        <div className="home-turn-plan-card">
          {explanation ? <p className="home-turn-plan-explanation">{explanation}</p> : null}
          <div className="home-turn-plan-summary">
            <span>{t("home.turnPlan.totalTasks", { total: totalSteps })}</span>
            <span>{t("home.turnPlan.completedTasks", { completed: completedSteps })}</span>
          </div>
          {isEmpty ? (
            <p className="home-turn-plan-empty">{t("home.turnPlan.empty")}</p>
          ) : (
            <ol className="home-turn-plan-list">
              {entry.plan.map((step, index) => (
                <li key={`${entry.id}-${index}`} className="home-turn-plan-item" data-status={step.status}>
                  <span className="home-turn-plan-index">{index + 1}</span>
                  <span className="home-turn-plan-text">{step.step}</span>
                  <span className="home-turn-plan-status">{formatTurnPlanStatusLabel(step.status, t)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
