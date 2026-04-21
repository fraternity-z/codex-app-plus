import type { PluginListResponse } from "../../../protocol/generated/v2/PluginListResponse";
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

export interface MarketplacePluginCard {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly pluginName: string;
  readonly marketplaceName: string;
  readonly marketplacePath: string | null;
  readonly icon: string | null;
  readonly brandColor: string | null;
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

export function createMarketplacePluginCards(
  response: PluginListResponse,
): ReadonlyArray<MarketplacePluginCard> {
  const cards = response.marketplaces.flatMap((marketplace) => marketplace.plugins
    .filter((plugin) => !plugin.installed && plugin.installPolicy !== "NOT_AVAILABLE")
      .map((plugin) => ({
        id: plugin.id,
        name: resolvePluginName(plugin.name, plugin.interface?.displayName ?? null),
        description: resolvePluginDescription(plugin.interface?.shortDescription ?? null, plugin.name),
        pluginName: plugin.name,
        marketplaceName: marketplace.name,
        marketplacePath: marketplace.path,
        icon:
          plugin.interface?.logoUrl
          ?? plugin.interface?.composerIconUrl
          ?? plugin.interface?.logo
          ?? plugin.interface?.composerIcon
          ?? null,
        brandColor: plugin.interface?.brandColor ?? null,
      })));
  return cards.sort(compareNamedItems);
}

export function filterInstalledSkillCards(
  skills: ReadonlyArray<InstalledSkillCard>,
  query: string,
): ReadonlyArray<InstalledSkillCard> {
  return skills.filter((skill) => matchesSkillQuery(skill.name, skill.description, query));
}

export function filterMarketplacePluginCards(
  skills: ReadonlyArray<MarketplacePluginCard>,
  query: string,
): ReadonlyArray<MarketplacePluginCard> {
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

function resolvePluginDescription(shortDescription: string | null, fallbackName: string): string {
  const normalized = shortDescription?.trim() ?? "";
  return normalized.length > 0 ? normalized : fallbackName.trim();
}

function resolvePluginName(name: string, displayName: string | null): string {
  const normalizedDisplayName = displayName?.trim() ?? "";
  return normalizedDisplayName.length > 0 ? normalizedDisplayName : name.trim();
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
