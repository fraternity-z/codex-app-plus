import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadGoal } from "../../../protocol/generated/v2/ThreadGoal";
import { useAppDispatch } from "../../../state/store";
import {
  formatThreadGoalElapsedSeconds,
  formatThreadGoalTitle,
} from "../../conversation/model/threadGoal";

interface HomeGoalStatusBarProps {
  readonly appServerReady?: boolean;
  readonly goal: ThreadGoal | null;
  readonly isResponding: boolean;
  readonly onEditGoal: (goal: ThreadGoal) => Promise<void>;
  readonly onToggleGoalStatus: (goal: ThreadGoal) => Promise<void>;
  readonly onClearGoal: (goal: ThreadGoal) => Promise<void>;
}

interface ObservedGoal {
  readonly goal: ThreadGoal;
  readonly observedAtMs: number;
}

export function HomeGoalStatusBar(props: HomeGoalStatusBarProps): JSX.Element | null {
  const dispatch = useAppDispatch();
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const observedGoalRef = useRef<ObservedGoal | null>(null);
  const goal = props.goal;

  useEffect(() => {
    if (goal === null) {
      observedGoalRef.current = null;
      return;
    }
    observedGoalRef.current = { goal, observedAtMs: Date.now() };
    setNowMs(Date.now());
  }, [goal]);

  useEffect(() => {
    if (goal?.status !== "active" || !props.isResponding) {
      return;
    }
    const intervalId = globalThis.setInterval(() => setNowMs(Date.now()), 1000);
    return () => globalThis.clearInterval(intervalId);
  }, [goal?.status, props.isResponding]);

  const elapsedSeconds = useMemo(() => {
    if (goal === null) {
      return 0;
    }
    const observed = observedGoalRef.current;
    if (goal.status !== "active" || !props.isResponding || observed === null || observed.goal !== goal) {
      return goal.timeUsedSeconds;
    }
    return goal.timeUsedSeconds + Math.max(0, Math.floor((nowMs - observed.observedAtMs) / 1000));
  }, [goal, nowMs, props.isResponding]);

  const runGoalAction = useCallback(async (action: () => Promise<void>) => {
    if (props.appServerReady === false || pending || goal === null) {
      return;
    }
    setPending(true);
    try {
      await action();
    } catch (error) {
      dispatch({
        type: "banner/pushed",
        banner: {
          id: `thread-goal:error:${goal.threadId}`,
          level: "error",
          title: "目标操作失败",
          detail: error instanceof Error ? error.message : String(error),
          source: "thread-goal",
        },
      });
    } finally {
      setPending(false);
    }
  }, [dispatch, goal, pending, props.appServerReady]);

  const editGoal = useCallback(() => {
    void runGoalAction(async () => {
      if (goal === null) {
        return;
      }
      await props.onEditGoal(goal);
    });
  }, [goal, props.onEditGoal, runGoalAction]);

  const toggleGoalStatus = useCallback(() => {
    void runGoalAction(async () => {
      if (goal === null) {
        return;
      }
      await props.onToggleGoalStatus(goal);
    });
  }, [goal, props.onToggleGoalStatus, runGoalAction]);

  const clearGoal = useCallback(() => {
    void runGoalAction(async () => {
      if (goal === null) {
        return;
      }
      await props.onClearGoal(goal);
    });
  }, [goal, props.onClearGoal, runGoalAction]);

  if (goal === null) {
    return null;
  }

  const controlsDisabled = pending || props.appServerReady === false;
  const pauseResumeLabel = goal.status === "active" ? "暂停目标" : "恢复目标";

  return (
    <section className="home-goal-status-bar" aria-label="当前目标" data-expanded={expanded ? "true" : "false"}>
      <div className="home-goal-status-row">
        <TargetIcon className="home-goal-status-icon" />
        <div className="home-goal-status-main">
          <span className="home-goal-status-title">{formatThreadGoalTitle(goal)}</span>
          <span className="home-goal-status-time">{formatThreadGoalElapsedSeconds(elapsedSeconds)}</span>
        </div>
        <div className="home-goal-status-actions">
          <button type="button" className="home-goal-status-action" aria-label="编辑目标" title="编辑目标" disabled={controlsDisabled} onClick={editGoal}>
            <EditIcon className="home-goal-status-action-icon" />
          </button>
          <button type="button" className="home-goal-status-action" aria-label={pauseResumeLabel} title={pauseResumeLabel} disabled={controlsDisabled} onClick={toggleGoalStatus}>
            {goal.status === "active" ? <PauseGoalIcon className="home-goal-status-action-icon" /> : <PlayGoalIcon className="home-goal-status-action-icon" />}
          </button>
          <button type="button" className="home-goal-status-action" aria-label="清除目标" title="清除目标" disabled={controlsDisabled} onClick={clearGoal}>
            <TrashIcon className="home-goal-status-action-icon" />
          </button>
          <button type="button" className="home-goal-status-action home-goal-status-expand" aria-label={expanded ? "收起目标详情" : "展开目标详情"} aria-expanded={expanded} title={expanded ? "收起目标详情" : "展开目标详情"} onClick={() => setExpanded((value) => !value)}>
            <ChevronDownIcon className="home-goal-status-action-icon" />
          </button>
        </div>
      </div>
      {expanded ? <p className="home-goal-status-objective">{goal.objective}</p> : null}
    </section>
  );
}

function TargetIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" /><circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>;
}

function EditIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 11.9l.7-2.8 6.8-6.8a1.3 1.3 0 0 1 1.8 0l1.2 1.2a1.3 1.3 0 0 1 0 1.8L6.9 12.1l-2.8.7a.8.8 0 0 1-.9-.9Z" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" /><path d="M9.8 3.2l3 3" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" /></svg>;
}

function PauseGoalIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.15" /><path d="M6.4 5.4v5.2M9.6 5.4v5.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" /></svg>;
}

function PlayGoalIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.15" /><path d="M6.6 5.4l4.3 2.6-4.3 2.6V5.4Z" fill="currentColor" /></svg>;
}

function TrashIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 4.6h9.2M6.3 4.6V3.4c0-.4.3-.7.7-.7h2c.4 0 .7.3.7.7v1.2M5 6.3l.4 6.2c0 .5.5.9 1 .9h3.2c.5 0 .9-.4 1-.9l.4-6.2" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ChevronDownIcon(props: { readonly className?: string }): JSX.Element {
  return <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
