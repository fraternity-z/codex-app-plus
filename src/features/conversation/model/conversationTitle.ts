import type { UserInput } from "../../../protocol/generated/v2/UserInput";
import { normalizeConversationMessageText } from "./conversationMessages";
import { summarizeUserInputs } from "./conversationUserInput";

function hasConversationTitle(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function pickConversationTitle(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): string | null {
  if (hasConversationTitle(primary)) {
    return primary;
  }
  if (hasConversationTitle(secondary)) {
    return secondary;
  }
  return null;
}

export function deriveConversationPreviewTitle(content: ReadonlyArray<UserInput>): string | null {
  const summary = summarizeUserInputs(content);
  return pickConversationTitle(normalizeConversationMessageText("user", summary.text), null);
}
