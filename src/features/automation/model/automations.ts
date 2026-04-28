import type { MessageKey } from "../../../i18n";
import type { ReasoningEffort } from "../../../protocol/generated/ReasoningEffort";
import type { ServiceTier } from "../../../protocol/generated/ServiceTier";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";

export type AutomationScheduleMode = "daily" | "weekdays" | "weekly";
export type AutomationTemplateIcon =
  | "chat"
  | "document"
  | "grid"
  | "book"
  | "check"
  | "pencil"
  | "power"
  | "terminal"
  | "search"
  | "test"
  | "dependency"
  | "chart"
  | "hierarchy";

export interface AutomationSchedule {
  readonly mode: AutomationScheduleMode;
  readonly time: string;
  readonly weekday?: number;
}

export interface AutomationTemplate {
  readonly id: string;
  readonly icon: AutomationTemplateIcon;
  readonly nameKey: MessageKey;
  readonly promptKey: MessageKey;
  readonly schedule: AutomationSchedule;
}

export interface AutomationTemplateSection {
  readonly id: string;
  readonly titleKey: MessageKey;
  readonly templateIds: ReadonlyArray<string>;
}

export interface AutomationRecord {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly schedule: AutomationSchedule;
  readonly workspaceRootId: string;
  readonly workspaceName: string;
  readonly workspacePath: string;
  readonly model: string | null;
  readonly effort: ReasoningEffort | null;
  readonly serviceTier: ServiceTier | null;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly nextRunAt: string;
  readonly lastRunAt: string | null;
  readonly lastError: string | null;
}

export interface AutomationDraft {
  readonly name: string;
  readonly prompt: string;
  readonly schedule: AutomationSchedule;
  readonly workspaceRootId: string;
  readonly model?: string | null;
  readonly effort?: ReasoningEffort | null;
  readonly serviceTier?: ServiceTier | null;
}

const DEFAULT_TIME = "09:00";
const MONDAY = 1;
const FRIDAY = 5;

export const DEFAULT_AUTOMATION_SCHEDULE: AutomationSchedule = Object.freeze({
  mode: "daily",
  time: DEFAULT_TIME,
});

export const AUTOMATION_TEMPLATES = [
  {
    id: "daily-standup",
    icon: "chat",
    nameKey: "home.automation.templates.dailyStandup.name",
    promptKey: "home.automation.templates.dailyStandup.prompt",
    schedule: { mode: "weekdays", time: "09:00" },
  },
  {
    id: "weekly-engineering-summary",
    icon: "document",
    nameKey: "home.automation.templates.weeklyEngineeringSummary.name",
    promptKey: "home.automation.templates.weeklyEngineeringSummary.prompt",
    schedule: { mode: "weekly", time: "16:00", weekday: FRIDAY },
  },
  {
    id: "weekly-pr-summary",
    icon: "grid",
    nameKey: "home.automation.templates.weeklyPrSummary.name",
    promptKey: "home.automation.templates.weeklyPrSummary.prompt",
    schedule: { mode: "weekly", time: "09:00", weekday: MONDAY },
  },
  {
    id: "weekly-release-notes",
    icon: "book",
    nameKey: "home.automation.templates.weeklyReleaseNotes.name",
    promptKey: "home.automation.templates.weeklyReleaseNotes.prompt",
    schedule: { mode: "weekly", time: "09:00", weekday: FRIDAY },
  },
  {
    id: "pre-release-check",
    icon: "check",
    nameKey: "home.automation.templates.preReleaseCheck.name",
    promptKey: "home.automation.templates.preReleaseCheck.prompt",
    schedule: { mode: "weekly", time: "13:00", weekday: 4 },
  },
  {
    id: "changelog-update",
    icon: "pencil",
    nameKey: "home.automation.templates.changelogUpdate.name",
    promptKey: "home.automation.templates.changelogUpdate.prompt",
    schedule: { mode: "weekly", time: "16:00", weekday: FRIDAY },
  },
  {
    id: "nightly-ci-report",
    icon: "power",
    nameKey: "home.automation.templates.nightlyCiReport.name",
    promptKey: "home.automation.templates.nightlyCiReport.prompt",
    schedule: { mode: "daily", time: "21:00" },
  },
  {
    id: "ci-monitor",
    icon: "terminal",
    nameKey: "home.automation.templates.ciMonitor.name",
    promptKey: "home.automation.templates.ciMonitor.prompt",
    schedule: { mode: "weekdays", time: "10:00" },
  },
  {
    id: "issue-triage",
    icon: "search",
    nameKey: "home.automation.templates.issueTriage.name",
    promptKey: "home.automation.templates.issueTriage.prompt",
    schedule: { mode: "weekdays", time: "09:30" },
  },
  {
    id: "daily-bug-scan",
    icon: "search",
    nameKey: "home.automation.templates.dailyBugScan.name",
    promptKey: "home.automation.templates.dailyBugScan.prompt",
    schedule: { mode: "daily", time: "09:00" },
  },
  {
    id: "test-gap-detection",
    icon: "test",
    nameKey: "home.automation.templates.testGapDetection.name",
    promptKey: "home.automation.templates.testGapDetection.prompt",
    schedule: { mode: "daily", time: "15:00" },
  },
  {
    id: "dependency-sweep",
    icon: "dependency",
    nameKey: "home.automation.templates.dependencySweep.name",
    promptKey: "home.automation.templates.dependencySweep.prompt",
    schedule: { mode: "weekly", time: "11:00", weekday: MONDAY },
  },
  {
    id: "sdk-version-drift",
    icon: "check",
    nameKey: "home.automation.templates.sdkVersionDrift.name",
    promptKey: "home.automation.templates.sdkVersionDrift.prompt",
    schedule: { mode: "weekly", time: "10:00", weekday: MONDAY },
  },
  {
    id: "safe-dependency-upgrade",
    icon: "dependency",
    nameKey: "home.automation.templates.safeDependencyUpgrade.name",
    promptKey: "home.automation.templates.safeDependencyUpgrade.prompt",
    schedule: { mode: "weekly", time: "11:00", weekday: MONDAY },
  },
  {
    id: "agents-md-refresh",
    icon: "document",
    nameKey: "home.automation.templates.agentsMdRefresh.name",
    promptKey: "home.automation.templates.agentsMdRefresh.prompt",
    schedule: { mode: "weekly", time: "14:00", weekday: FRIDAY },
  },
  {
    id: "skill-growth-recommendations",
    icon: "hierarchy",
    nameKey: "home.automation.templates.skillGrowthRecommendations.name",
    promptKey: "home.automation.templates.skillGrowthRecommendations.prompt",
    schedule: { mode: "weekly", time: "15:00", weekday: FRIDAY },
  },
  {
    id: "performance-regression-watch",
    icon: "chart",
    nameKey: "home.automation.templates.performanceRegressionWatch.name",
    promptKey: "home.automation.templates.performanceRegressionWatch.prompt",
    schedule: { mode: "daily", time: "09:00" },
  },
] as const satisfies ReadonlyArray<AutomationTemplate>;

export const AUTOMATION_SECTIONS = [
  {
    id: "status-reports",
    titleKey: "home.automation.sections.statusReports",
    templateIds: ["daily-standup", "weekly-engineering-summary", "weekly-pr-summary"],
  },
  {
    id: "release-prep",
    titleKey: "home.automation.sections.releasePrep",
    templateIds: ["weekly-release-notes", "pre-release-check", "changelog-update"],
  },
  {
    id: "incidents-triage",
    titleKey: "home.automation.sections.incidentsAndTriage",
    templateIds: ["nightly-ci-report", "ci-monitor", "issue-triage"],
  },
  {
    id: "code-quality",
    titleKey: "home.automation.sections.codeQuality",
    templateIds: ["daily-bug-scan", "test-gap-detection", "dependency-sweep"],
  },
  {
    id: "repo-maintenance",
    titleKey: "home.automation.sections.repoMaintenance",
    templateIds: ["sdk-version-drift", "safe-dependency-upgrade", "agents-md-refresh"],
  },
  {
    id: "growth-exploration",
    titleKey: "home.automation.sections.growthAndExploration",
    templateIds: ["skill-growth-recommendations", "performance-regression-watch"],
  },
] as const satisfies ReadonlyArray<AutomationTemplateSection>;

export function getAutomationTemplate(templateId: string): AutomationTemplate | null {
  return AUTOMATION_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function getAutomationSectionTemplates(
  section: AutomationTemplateSection,
): ReadonlyArray<AutomationTemplate> {
  return section.templateIds.flatMap((templateId) => {
    const template = getAutomationTemplate(templateId);
    return template === null ? [] : [template];
  });
}

export function parseAutomationRecords(value: unknown): ReadonlyArray<AutomationRecord> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = parseAutomationRecord(item);
    return record === null ? [] : [record];
  });
}

export function createAutomationRecord(
  draft: AutomationDraft,
  root: WorkspaceRoot,
  now: Date = new Date(),
): AutomationRecord {
  const createdAt = now.toISOString();
  return {
    id: `automation-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`,
    name: draft.name.trim(),
    prompt: draft.prompt.trim(),
    schedule: normalizeSchedule(draft.schedule),
    workspaceRootId: root.id,
    workspaceName: root.name,
    workspacePath: root.path,
    model: normalizeModel(draft.model),
    effort: normalizeReasoningEffort(draft.effort),
    serviceTier: normalizeServiceTier(draft.serviceTier),
    enabled: true,
    createdAt,
    updatedAt: createdAt,
    nextRunAt: computeNextRunAt(draft.schedule, now).toISOString(),
    lastRunAt: null,
    lastError: null,
  };
}

export function updateAutomationRecord(
  record: AutomationRecord,
  draft: AutomationDraft,
  root: WorkspaceRoot,
  now: Date = new Date(),
): AutomationRecord {
  const schedule = normalizeSchedule(draft.schedule);
  return {
    ...record,
    name: draft.name.trim(),
    prompt: draft.prompt.trim(),
    schedule,
    workspaceRootId: root.id,
    workspaceName: root.name,
    workspacePath: root.path,
    model: normalizeModel(draft.model),
    effort: normalizeReasoningEffort(draft.effort),
    serviceTier: normalizeServiceTier(draft.serviceTier),
    updatedAt: now.toISOString(),
    nextRunAt: computeNextRunAt(schedule, now).toISOString(),
    lastError: null,
  };
}

export function recordAutomationRunResult(
  record: AutomationRecord,
  result: { readonly runAt: Date; readonly error: string | null },
): AutomationRecord {
  return {
    ...record,
    updatedAt: result.runAt.toISOString(),
    lastRunAt: result.runAt.toISOString(),
    lastError: result.error,
    nextRunAt: computeNextRunAt(record.schedule, result.runAt).toISOString(),
  };
}

export function isAutomationDue(record: AutomationRecord, now: Date = new Date()): boolean {
  return record.enabled && Date.parse(record.nextRunAt) <= now.getTime();
}

export function computeNextRunAt(schedule: AutomationSchedule, from: Date = new Date()): Date {
  const normalized = normalizeSchedule(schedule);
  const minuteOfDay = parseTimeToMinuteOfDay(normalized.time) ?? parseTimeToMinuteOfDay(DEFAULT_TIME) ?? 540;
  const targetWeekday = normalized.weekday ?? MONDAY;

  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = createCandidateDate(from, offset, minuteOfDay);
    if (candidate.getTime() <= from.getTime()) {
      continue;
    }
    if (normalized.mode === "daily") {
      return candidate;
    }
    if (normalized.mode === "weekdays" && isWeekday(candidate)) {
      return candidate;
    }
    if (normalized.mode === "weekly" && candidate.getDay() === targetWeekday) {
      return candidate;
    }
  }

  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}

export function formatAutomationScheduleLabel(schedule: AutomationSchedule): MessageKey {
  if (schedule.mode === "weekdays") {
    return "home.automation.schedule.weekdays";
  }
  if (schedule.mode === "weekly") {
    return "home.automation.schedule.weekly";
  }
  return "home.automation.schedule.daily";
}

function parseAutomationRecord(value: unknown): AutomationRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Partial<AutomationRecord>;
  if (
    typeof candidate.id !== "string"
    || typeof candidate.name !== "string"
    || typeof candidate.prompt !== "string"
    || typeof candidate.workspaceRootId !== "string"
    || typeof candidate.workspaceName !== "string"
    || typeof candidate.workspacePath !== "string"
    || typeof candidate.enabled !== "boolean"
    || typeof candidate.createdAt !== "string"
    || typeof candidate.updatedAt !== "string"
    || typeof candidate.nextRunAt !== "string"
    || (candidate.lastRunAt !== null && typeof candidate.lastRunAt !== "string")
    || (candidate.lastError !== null && typeof candidate.lastError !== "string")
  ) {
    return null;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    prompt: candidate.prompt,
    schedule: normalizeSchedule(candidate.schedule),
    workspaceRootId: candidate.workspaceRootId,
    workspaceName: candidate.workspaceName,
    workspacePath: candidate.workspacePath,
    model: normalizeModel(candidate.model),
    effort: normalizeReasoningEffort(candidate.effort),
    serviceTier: normalizeServiceTier(candidate.serviceTier),
    enabled: candidate.enabled,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    nextRunAt: candidate.nextRunAt,
    lastRunAt: candidate.lastRunAt,
    lastError: candidate.lastError,
  };
}

function normalizeSchedule(value: unknown): AutomationSchedule {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_AUTOMATION_SCHEDULE;
  }
  const candidate = value as Partial<AutomationSchedule>;
  const mode = isScheduleMode(candidate.mode) ? candidate.mode : DEFAULT_AUTOMATION_SCHEDULE.mode;
  const time = typeof candidate.time === "string" && parseTimeToMinuteOfDay(candidate.time) !== null
    ? candidate.time
    : DEFAULT_AUTOMATION_SCHEDULE.time;
  const weekday = typeof candidate.weekday === "number" && candidate.weekday >= 0 && candidate.weekday <= 6
    ? Math.floor(candidate.weekday)
    : undefined;
  return mode === "weekly" ? { mode, time, weekday: weekday ?? MONDAY } : { mode, time };
}

function isScheduleMode(value: unknown): value is AutomationScheduleMode {
  return value === "daily" || value === "weekdays" || value === "weekly";
}

function normalizeModel(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | null {
  return value === "none"
    || value === "minimal"
    || value === "low"
    || value === "medium"
    || value === "high"
    || value === "xhigh"
    ? value
    : null;
}

function normalizeServiceTier(value: unknown): ServiceTier | null {
  return value === "fast" || value === "flex" ? value : null;
}

function parseTimeToMinuteOfDay(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function createCandidateDate(from: Date, offsetDays: number, minuteOfDay: number): Date {
  const candidate = new Date(from);
  candidate.setDate(candidate.getDate() + offsetDays);
  candidate.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
  return candidate;
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}
