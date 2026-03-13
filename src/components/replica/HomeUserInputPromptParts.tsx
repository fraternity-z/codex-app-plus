import type { Dispatch, SetStateAction } from "react";
import type { ToolRequestUserInputQuestion } from "../../protocol/generated/v2/ToolRequestUserInputQuestion";
import {
  hasSelectableOptions,
  usesFreeTextInput,
  type UserInputDraftMap,
} from "./homeUserInputPromptModel";
import { OfficialChevronRightIcon } from "./officialIcons";

export function PromptHeaderAside(props: {
  readonly currentIndex: number;
  readonly questions: ReadonlyArray<ToolRequestUserInputQuestion>;
  readonly setCurrentIndex: Dispatch<SetStateAction<number>>;
}): JSX.Element {
  return (
    <PromptProgress
      currentIndex={props.currentIndex}
      totalQuestions={props.questions.length}
      onPrevious={() => props.setCurrentIndex((index) => Math.max(0, index - 1))}
      onNext={() => props.setCurrentIndex((index) => Math.min(props.questions.length - 1, index + 1))}
    />
  );
}

export function PromptActions(props: {
  readonly busy: boolean;
  readonly submitDisabled: boolean;
  readonly onSubmit: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="plan-request-submit home-user-input-submit"
      disabled={props.busy || props.submitDisabled}
      onClick={props.onSubmit}
    >
      提交答案
    </button>
  );
}

export function PromptBody(props: {
  readonly busy: boolean;
  readonly currentIndex: number;
  readonly question: ToolRequestUserInputQuestion;
  readonly questions: ReadonlyArray<ToolRequestUserInputQuestion>;
  readonly selectedOptions: UserInputDraftMap;
  readonly freeText: UserInputDraftMap;
  readonly setCurrentIndex: Dispatch<SetStateAction<number>>;
  readonly setFreeText: Dispatch<SetStateAction<Record<string, string>>>;
  readonly setSelectedOptions: Dispatch<SetStateAction<Record<string, string>>>;
}): JSX.Element {
  return (
    <>
      <QuestionHeader question={props.question} />
      <QuestionOptions
        busy={props.busy}
        currentIndex={props.currentIndex}
        question={props.question}
        questions={props.questions}
        selectedOptions={props.selectedOptions}
        setCurrentIndex={props.setCurrentIndex}
        setFreeText={props.setFreeText}
        setSelectedOptions={props.setSelectedOptions}
      />
      <FreeTextField
        busy={props.busy}
        question={props.question}
        selectedOptions={props.selectedOptions}
        freeText={props.freeText}
        setFreeText={props.setFreeText}
        setSelectedOptions={props.setSelectedOptions}
      />
    </>
  );
}

function PromptProgress(props: {
  readonly currentIndex: number;
  readonly totalQuestions: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}): JSX.Element {
  const canGoPrevious = props.currentIndex > 0;
  const canGoNext = props.currentIndex < props.totalQuestions - 1;

  return (
    <div className="home-user-input-progress">
      <span className="home-user-input-progress-count">
        {props.currentIndex + 1}
        /
        {props.totalQuestions}
      </span>
      {props.totalQuestions > 1 ? (
        <div className="home-user-input-progress-nav">
          <button
            type="button"
            className="home-user-input-progress-button"
            aria-label="上一题"
            disabled={!canGoPrevious}
            onClick={props.onPrevious}
          >
            <OfficialChevronRightIcon className="home-user-input-progress-icon home-user-input-progress-icon-back" />
          </button>
          <button
            type="button"
            className="home-user-input-progress-button"
            aria-label="下一题"
            disabled={!canGoNext}
            onClick={props.onNext}
          >
            <OfficialChevronRightIcon className="home-user-input-progress-icon" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function QuestionHeader(props: { readonly question: ToolRequestUserInputQuestion }): JSX.Element {
  return (
    <div className="home-user-input-question">
      <p className="home-user-input-question-header">{props.question.header}</p>
      <p className="home-user-input-question-copy">{props.question.question}</p>
    </div>
  );
}

function QuestionOptions(props: {
  readonly busy: boolean;
  readonly currentIndex: number;
  readonly question: ToolRequestUserInputQuestion;
  readonly questions: ReadonlyArray<ToolRequestUserInputQuestion>;
  readonly selectedOptions: UserInputDraftMap;
  readonly setCurrentIndex: Dispatch<SetStateAction<number>>;
  readonly setFreeText: Dispatch<SetStateAction<Record<string, string>>>;
  readonly setSelectedOptions: Dispatch<SetStateAction<Record<string, string>>>;
}): JSX.Element | null {
  if (!hasSelectableOptions(props.question)) {
    return null;
  }

  const selectedOption = props.selectedOptions[props.question.id] ?? "";
  return (
    <div className="home-user-input-options">
      {props.question.options?.map((option, index) => (
        <OptionButton
          key={option.label}
          index={index + 1}
          label={option.label}
          description={option.description}
          selected={selectedOption === option.label}
          disabled={props.busy}
          onClick={() => applySelectedOption(props, option.label)}
        />
      ))}
    </div>
  );
}

function applySelectedOption(
  props: {
    readonly currentIndex: number;
    readonly question: ToolRequestUserInputQuestion;
    readonly questions: ReadonlyArray<ToolRequestUserInputQuestion>;
    readonly setCurrentIndex: Dispatch<SetStateAction<number>>;
    readonly setFreeText: Dispatch<SetStateAction<Record<string, string>>>;
    readonly setSelectedOptions: Dispatch<SetStateAction<Record<string, string>>>;
  },
  optionLabel: string,
): void {
  props.setSelectedOptions((current) => ({ ...current, [props.question.id]: optionLabel }));
  if (usesFreeTextInput(props.question)) {
    props.setFreeText((current) => ({ ...current, [props.question.id]: "" }));
  }

  if (props.currentIndex < props.questions.length - 1) {
    props.setCurrentIndex((index) => Math.min(props.questions.length - 1, index + 1));
  }
}

function OptionButton(props: {
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
      className="plan-request-option home-user-input-option"
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

function FreeTextField(props: {
  readonly busy: boolean;
  readonly question: ToolRequestUserInputQuestion;
  readonly selectedOptions: UserInputDraftMap;
  readonly freeText: UserInputDraftMap;
  readonly setFreeText: Dispatch<SetStateAction<Record<string, string>>>;
  readonly setSelectedOptions: Dispatch<SetStateAction<Record<string, string>>>;
}): JSX.Element | null {
  if (!usesFreeTextInput(props.question)) {
    return null;
  }

  const label = props.question.isOther ? "其他答案" : "回答";
  const value = props.freeText[props.question.id] ?? "";
  const placeholder = props.question.isSecret ? "请输入答案" : "输入你的回答";

  return (
    <label className="home-user-input-freeform">
      <span className="home-user-input-freeform-label">{label}</span>
      {props.question.isSecret ? (
        <input
          className="home-user-input-input"
          type="password"
          value={value}
          placeholder={placeholder}
          disabled={props.busy}
          onChange={(event) => handleFreeTextChange(props, event.currentTarget.value)}
        />
      ) : (
        <textarea
          className="home-user-input-textarea"
          value={value}
          placeholder={placeholder}
          disabled={props.busy}
          onChange={(event) => handleFreeTextChange(props, event.currentTarget.value)}
        />
      )}
    </label>
  );
}

function handleFreeTextChange(
  props: {
    readonly question: ToolRequestUserInputQuestion;
    readonly selectedOptions: UserInputDraftMap;
    readonly setFreeText: Dispatch<SetStateAction<Record<string, string>>>;
    readonly setSelectedOptions: Dispatch<SetStateAction<Record<string, string>>>;
  },
  nextValue: string,
): void {
  props.setFreeText((current) => ({ ...current, [props.question.id]: nextValue }));
  if (!hasSelectableOptions(props.question) || nextValue.trim().length === 0) {
    return;
  }

  if ((props.selectedOptions[props.question.id] ?? "").length > 0) {
    props.setSelectedOptions((current) => ({ ...current, [props.question.id]: "" }));
  }
}
