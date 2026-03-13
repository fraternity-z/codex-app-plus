import { useEffect, useState } from "react";
import { HomePromptCard } from "./HomePromptCard";

const IMPLEMENT_OPTION = "是，实施此计划";
const REFINE_OPTION = "否，请告知 Codex 如何调整";

interface HomePlanRequestComposerProps {
  readonly busy: boolean;
  readonly onDismiss: () => void;
  readonly onImplement: () => Promise<void>;
  readonly onRefine: (notes: string) => Promise<void>;
}

export function HomePlanRequestComposer(props: HomePlanRequestComposerProps): JSX.Element {
  const [selectedOption, setSelectedOption] = useState(IMPLEMENT_OPTION);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setSelectedOption(IMPLEMENT_OPTION);
    setNotes("");
  }, [props.busy]);

  const refineSelected = selectedOption === REFINE_OPTION;
  const submitDisabled = props.busy || (refineSelected && notes.trim().length === 0);

  return (
    <HomePromptCard
      ariaLabel="实施此计划？"
      title="实施此计划？"
      subtitle="确认实施，或补充你希望 Codex 调整的方案细节。"
      actions={(
        <>
          <button type="button" className="plan-request-escape" disabled={props.busy} onClick={props.onDismiss}>Esc</button>
          <button
            type="button"
            className="plan-request-submit"
            disabled={submitDisabled}
            onClick={() => void (refineSelected ? props.onRefine(notes.trim()) : props.onImplement())}
          >
            提交
          </button>
        </>
      )}
    >
      <PlanOptionButton
        index={1}
        label={IMPLEMENT_OPTION}
        description="切换到默认模式并开始编码。"
        selected={selectedOption === IMPLEMENT_OPTION}
        disabled={props.busy}
        onClick={() => setSelectedOption(IMPLEMENT_OPTION)}
      />
      <PlanOptionButton
        index={2}
        label={REFINE_OPTION}
        description="继续在计划模式中完善方案。"
        selected={refineSelected}
        disabled={props.busy}
        onClick={() => setSelectedOption(REFINE_OPTION)}
      />
      {refineSelected ? (
        <textarea
          className="plan-request-notes"
          value={notes}
          disabled={props.busy}
          placeholder="请告诉 Codex 该如何调整方案"
          onChange={(event) => setNotes(event.currentTarget.value)}
        />
      ) : null}
    </HomePromptCard>
  );
}

function PlanOptionButton(props: {
  readonly index: number;
  readonly label: string;
  readonly description: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="plan-request-option"
      data-selected={props.selected ? "true" : undefined}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="plan-request-option-index">{props.index}.</span>
      <span className="plan-request-option-copy">
        <strong>{props.label}</strong>
        <small>{props.description}</small>
      </span>
    </button>
  );
}
