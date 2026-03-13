import type { PendingUserInputEntry, TimelineEntry } from "../../../domain/timeline";
import type { ServerRequestResolution } from "../../../domain/types";
import type { ToolRequestUserInputQuestion } from "../../../protocol/generated/v2/ToolRequestUserInputQuestion";

export type UserInputDraftMap = Readonly<Record<string, string>>;

export function selectLatestPendingUserInput(
  entries: ReadonlyArray<TimelineEntry>,
): PendingUserInputEntry | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.kind === "pendingUserInput") {
      return entry;
    }
  }
  return null;
}

export function hasSelectableOptions(question: ToolRequestUserInputQuestion): boolean {
  return (question.options?.length ?? 0) > 0;
}

export function usesFreeTextInput(question: ToolRequestUserInputQuestion): boolean {
  return question.isOther || question.options === null;
}

export function isUserInputQuestionAnswered(
  question: ToolRequestUserInputQuestion,
  selectedOptions: UserInputDraftMap,
  freeText: UserInputDraftMap,
): boolean {
  const typedValue = freeText[question.id]?.trim() ?? "";
  const selectedOption = selectedOptions[question.id]?.trim() ?? "";
  return typedValue.length > 0 || selectedOption.length > 0;
}

export function buildUserInputResolution(
  entry: PendingUserInputEntry,
  selectedOptions: UserInputDraftMap,
  freeText: UserInputDraftMap,
): ServerRequestResolution {
  const answers = Object.fromEntries(
    entry.request.questions.map((question) => [
      question.id,
      buildQuestionAnswers(question, selectedOptions, freeText),
    ]),
  );
  return { kind: "userInput", requestId: entry.requestId, answers };
}

function buildQuestionAnswers(
  question: ToolRequestUserInputQuestion,
  selectedOptions: UserInputDraftMap,
  freeText: UserInputDraftMap,
): Array<string> {
  const typedValue = freeText[question.id]?.trim() ?? "";
  if (typedValue.length > 0) {
    return [typedValue];
  }

  const selectedOption = selectedOptions[question.id]?.trim() ?? "";
  return selectedOption.length > 0 ? [selectedOption] : [];
}
