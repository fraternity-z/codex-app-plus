import type { RemoteSkillSummary } from "../../../protocol/generated/v2/RemoteSkillSummary";
import type { SkillErrorInfo } from "../../../protocol/generated/v2/SkillErrorInfo";
import type { SkillMetadata } from "../../../protocol/generated/v2/SkillMetadata";
import type { SkillScope } from "../../../protocol/generated/v2/SkillScope";
import type { SkillsListEntry } from "../../../protocol/generated/v2/SkillsListEntry";

export interface InstalledSkillCard {
  readonly path: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly scope: SkillScope;
  readonly icon: string | null;
  readonly brandColor: string | null;
}

export interface RemoteSkillCard {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface InstalledSkillsCatalog {
  readonly skills: ReadonlyArray<InstalledSkillCard>;
  readonly scanErrors: ReadonlyArray<SkillErrorInfo>;
}

export function createInstalledSkillsCatalog(
  entries: ReadonlyArray<SkillsListEntry>,
): InstalledSkillsCatalog {
  const skillsByPath = new Map<string, InstalledSkillCard>();
  const scanErrors = entries.flatMap((entry) => entry.errors);

  for (const skill of entries.flatMap((entry) => entry.skills)) {
    skillsByPath.set(skill.path, createInstalledSkillCard(skill));
  }

  return {
    skills: [...skillsByPath.values()].sort(compareNamedItems),
    scanErrors,
  };
}

export function createRemoteSkillCards(
  items: ReadonlyArray<RemoteSkillSummary>,
): ReadonlyArray<RemoteSkillCard> {
  return items.map((item) => ({
    id: item.id,
    name: item.name.trim(),
    description: item.description.trim(),
  })).sort(compareNamedItems);
}

export function filterInstalledSkillCards(
  skills: ReadonlyArray<InstalledSkillCard>,
  query: string,
): ReadonlyArray<InstalledSkillCard> {
  return skills.filter((skill) => matchesSkillQuery(skill.name, skill.description, query));
}

export function filterRemoteSkillCards(
  skills: ReadonlyArray<RemoteSkillCard>,
  query: string,
): ReadonlyArray<RemoteSkillCard> {
  return skills.filter((skill) => matchesSkillQuery(skill.name, skill.description, query));
}

export function replaceInstalledSkillEnabled(
  catalog: InstalledSkillsCatalog,
  path: string,
  enabled: boolean,
): InstalledSkillsCatalog {
  return {
    ...catalog,
    skills: catalog.skills.map((skill) => (
      skill.path === path ? { ...skill, enabled } : skill
    )),
  };
}

function createInstalledSkillCard(skill: SkillMetadata): InstalledSkillCard {
  return {
    path: skill.path,
    name: resolveSkillName(skill),
    description: resolveSkillDescription(skill),
    enabled: skill.enabled,
    scope: skill.scope,
    icon: skill.interface?.iconSmall ?? null,
    brandColor: skill.interface?.brandColor ?? null,
  };
}

function resolveSkillName(skill: SkillMetadata): string {
  const displayName = skill.interface?.displayName?.trim();
  return displayName && displayName.length > 0 ? displayName : skill.name.trim();
}

function resolveSkillDescription(skill: SkillMetadata): string {
  const shortDescription = skill.interface?.shortDescription?.trim()
    ?? skill.shortDescription?.trim()
    ?? "";
  if (shortDescription.length > 0) {
    return shortDescription;
  }
  return skill.description.trim();
}

function matchesSkillQuery(name: string, description: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }
  return `${name}\n${description}`.toLowerCase().includes(normalizedQuery);
}

function compareNamedItems<T extends { readonly name: string }>(left: T, right: T): number {
  return left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" });
}
