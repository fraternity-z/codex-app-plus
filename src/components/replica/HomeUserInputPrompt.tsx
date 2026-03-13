import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PendingUserInputEntry } from "../../domain/timeline";
import type { ServerRequestResolution } from "../../domain/types";
import type { ToolRequestUserInputQuestion } from "../../protocol/generated/v2/ToolRequestUserInputQuestion";
import { HomePromptCard } from "./HomePromptCard";
import {
  buildUserInputResolution,
  isUserInputQuestionAnswered,
  type UserInputDraftMap,
} from "./homeUserInputPromptModel";
import {
  PromptActions,
  PromptBody,
  PromptHeaderAside,
} from "./HomeUserInputPromptParts";

interface HomeUserInputPromptProps {
  readonly busy: boolean;
  readonly entry: PendingUserInputEntry;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}

export function HomeUserInputPrompt(props: HomeUserInputPromptProps): JSX.Element | null {
  const questions = props.entry.request.questions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState<Record<string, string>>({});

  useEffect(() => {
    setCurrentIndex(0);
    setSelectedOptions({});
    setFreeText({});
  }, [props.entry.requestId]);

  const currentQuestion = questions[currentIndex];
  const allQuestionsAnswered = useMemo(
    () => questions.every((question) => isUserInputQuestionAnswered(question, selectedOptions, freeText)),
    [freeText, questions, selectedOptions],
  );

  if (!currentQuestion) {
    return null;
  }

  return (
    <UserInputPromptCard
      busy={props.busy}
      currentIndex={currentIndex}
      currentQuestion={currentQuestion}
      entry={props.entry}
      freeText={freeText}
      onResolveServerRequest={props.onResolveServerRequest}
      questions={questions}
      selectedOptions={selectedOptions}
      setCurrentIndex={setCurrentIndex}
      setFreeText={setFreeText}
      setSelectedOptions={setSelectedOptions}
      submitDisabled={!allQuestionsAnswered}
    />
  );
}

function UserInputPromptCard(props: {
  readonly busy: boolean;
  readonly currentIndex: number;
  readonly currentQuestion: ToolRequestUserInputQuestion;
  readonly entry: PendingUserInputEntry;
  readonly freeText: UserInputDraftMap;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
  readonly questions: ReadonlyArray<ToolRequestUserInputQuestion>;
  readonly selectedOptions: UserInputDraftMap;
  readonly setCurrentIndex: Dispatch<SetStateAction<number>>;
  readonly setFreeText: Dispatch<SetStateAction<Record<string, string>>>;
  readonly setSelectedOptions: Dispatch<SetStateAction<Record<string, string>>>;
  readonly submitDisabled: boolean;
}): JSX.Element {
  return (
    <HomePromptCard
      ariaLabel="需要补充信息"
      className="home-user-input-prompt"
      title="需要补充信息"
      subtitle="先回答这个问题，Codex 才能继续执行。"
      headerAside={<PromptHeaderAside currentIndex={props.currentIndex} questions={props.questions} setCurrentIndex={props.setCurrentIndex} />}
      bodyClassName="home-user-input-prompt-body"
      actions={<PromptActions busy={props.busy} submitDisabled={props.submitDisabled} onSubmit={() => void props.onResolveServerRequest(buildUserInputResolution(props.entry, props.selectedOptions, props.freeText))} />}
    >
      <PromptBody
        busy={props.busy}
        currentIndex={props.currentIndex}
        question={props.currentQuestion}
        questions={props.questions}
        selectedOptions={props.selectedOptions}
        freeText={props.freeText}
        setCurrentIndex={props.setCurrentIndex}
        setFreeText={props.setFreeText}
        setSelectedOptions={props.setSelectedOptions}
      />
    </HomePromptCard>
  );
}
