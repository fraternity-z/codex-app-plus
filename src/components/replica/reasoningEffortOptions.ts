import type { ReasoningEffort } from "../../protocol/generated/ReasoningEffort";

export interface SelectableReasoningEffort {
  readonly value: ReasoningEffort;
  readonly label: string;
}

const LOWEST_REASONING_EFFORT_LABEL = "\u6781\u4f4e";
const DEFAULT_REASONING_EFFORT_LABEL = "\u8d85\u9ad8";
const BASE_REASONING_EFFORT_ORDER = ["low", "medium", "high", "xhigh"] as const satisfies ReadonlyArray<ReasoningEffort>;
const LOWEST_REASONING_EFFORT_VALUES = new Set<ReasoningEffort>(["none", "minimal"]);
const REASONING_EFFORT_LABELS: Readonly<Record<ReasoningEffort, string>> = Object.freeze({
  none: LOWEST_REASONING_EFFORT_LABEL,
  minimal: LOWEST_REASONING_EFFORT_LABEL,
  low: "\u4f4e",
  medium: "\u4e2d",
  high: "\u9ad8",
  xhigh: DEFAULT_REASONING_EFFORT_LABEL
});

function resolveLowestReasoningEffort(
  supportedEfforts: ReadonlyArray<ReasoningEffort>,
  selectedEffort: ReasoningEffort | null
): ReasoningEffort | null {
  if (supportedEfforts.includes("minimal")) {
    return "minimal";
  }
  if (supportedEfforts.includes("none")) {
    return "none";
  }
  if (selectedEffort === "minimal" || selectedEffort === "none") {
    return selectedEffort;
  }
  if (supportedEfforts.length === 0) {
    return "minimal";
  }
  return null;
}

function shouldIncludeReasoningEffort(
  supportedEfforts: ReadonlyArray<ReasoningEffort>,
  effort: ReasoningEffort
): boolean {
  return supportedEfforts.length === 0 || supportedEfforts.includes(effort);
}

export function getReasoningEffortLabel(effort: ReasoningEffort | null): string {
  if (effort === null) {
    return DEFAULT_REASONING_EFFORT_LABEL;
  }
  return REASONING_EFFORT_LABELS[effort];
}

export function isReasoningEffortSelected(selectedEffort: ReasoningEffort | null, value: ReasoningEffort): boolean {
  if (selectedEffort === value) {
    return true;
  }
  return selectedEffort !== null && LOWEST_REASONING_EFFORT_VALUES.has(selectedEffort) && LOWEST_REASONING_EFFORT_VALUES.has(value);
}

export function listSelectableReasoningEfforts(
  supportedEfforts: ReadonlyArray<ReasoningEffort>,
  selectedEffort: ReasoningEffort | null
): ReadonlyArray<SelectableReasoningEffort> {
  const lowestEffort = resolveLowestReasoningEffort(supportedEfforts, selectedEffort);
  const items: Array<SelectableReasoningEffort> = [];

  if (lowestEffort !== null) {
    items.push({ value: lowestEffort, label: REASONING_EFFORT_LABELS[lowestEffort] });
  }

  for (const effort of BASE_REASONING_EFFORT_ORDER) {
    if (shouldIncludeReasoningEffort(supportedEfforts, effort)) {
      items.push({ value: effort, label: REASONING_EFFORT_LABELS[effort] });
    }
  }

  return items;
}
