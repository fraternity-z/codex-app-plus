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
  readonly longDescription: string | null;
  readonly pluginName: string;
  readonly marketplaceName: string;
  readonly marketplaceDisplayName: string;
  readonly marketplacePath: string | null;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly installPolicy: "NOT_AVAILABLE" | "AVAILABLE" | "INSTALLED_BY_DEFAULT";
  readonly authPolicy: "ON_INSTALL" | "ON_USE";
  readonly icon: string | null;
  readonly brandColor: string | null;
  readonly category: string;
  readonly featured: boolean;
  readonly defaultPrompts: ReadonlyArray<string>;
}

export interface MarketplaceFilterOption {
  readonly id: string;
  readonly label: string;
}

export interface MarketplacePluginsCatalog {
  readonly plugins: ReadonlyArray<MarketplacePluginCard>;
  readonly marketplaces: ReadonlyArray<MarketplaceFilterOption>;
}

export interface InstalledSkillsCatalog {
  readonly skills: ReadonlyArray<InstalledSkillCard>;
  readonly scanErrors: ReadonlyArray<SkillErrorInfo>;
}

const HIDDEN_MARKETPLACE_NAMES = new Set(["openai-bundled"]);
const OFFICIAL_MARKETPLACE_NAME = "openai-curated";
const DEFAULT_PLUGIN_CATEGORY = "Coding";

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
): MarketplacePluginsCatalog {
  const featuredPluginIds = new Set(response.featuredPluginIds);
  const visibleMarketplaces = response.marketplaces
    .map((marketplace) => ({
      ...marketplace,
      plugins: marketplace.plugins.filter((plugin) => (
        isMarketplacePluginVisible(marketplace.name, plugin)
      )),
    }))
    .filter((marketplace) => marketplace.plugins.length > 0);
  const marketplaceOptions = visibleMarketplaces
    .map((marketplace) => ({
      id: marketplace.name,
      label: resolveMarketplaceDisplayName(marketplace.name, marketplace.interface?.displayName ?? null),
    }))
    .sort(compareOptionLabels);
  const cards = visibleMarketplaces.flatMap((marketplace) => {
    const marketplaceDisplayName = resolveMarketplaceDisplayName(
      marketplace.name,
      marketplace.interface?.displayName ?? null,
    );
    return marketplace.plugins
      .map((plugin) => ({
        id: plugin.id,
        name: resolvePluginName(plugin.name, plugin.interface?.displayName ?? null),
        description: resolvePluginDescription(plugin.interface?.shortDescription ?? null, plugin.name),
        longDescription: resolveNullableText(plugin.interface?.longDescription ?? null),
        pluginName: plugin.name,
        marketplaceName: marketplace.name,
        marketplaceDisplayName,
        marketplacePath: marketplace.path,
        installed: plugin.installed,
        enabled: plugin.enabled,
        installPolicy: plugin.installPolicy,
        authPolicy: plugin.authPolicy,
        icon:
          plugin.interface?.logoUrl
          ?? plugin.interface?.composerIconUrl
          ?? plugin.interface?.logo
          ?? plugin.interface?.composerIcon
          ?? null,
        brandColor: plugin.interface?.brandColor ?? null,
        category: resolvePluginCategory(plugin.interface?.category ?? null),
        featured: featuredPluginIds.has(plugin.id),
        defaultPrompts: plugin.interface?.defaultPrompt ?? [],
      }));
  });
  return {
    plugins: cards.sort(compareMarketplacePlugins),
    marketplaces: marketplaceOptions,
  };
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
  marketplaceName: string,
  status: "all" | "installed" | "available",
): ReadonlyArray<MarketplacePluginCard> {
  return skills.filter((skill) => {
    if (!matchesSkillQuery(skill.name, `${skill.description}\n${skill.marketplaceDisplayName}`, query)) {
      return false;
    }
    if (marketplaceName !== "all" && skill.marketplaceName !== marketplaceName) {
      return false;
    }
    if (status === "installed") {
      return skill.installed;
    }
    if (status === "available") {
      return !skill.installed && skill.installPolicy !== "NOT_AVAILABLE";
    }
    return true;
  });
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

export function removeInstalledSkill(
  catalog: InstalledSkillsCatalog,
  path: string,
): InstalledSkillsCatalog {
  return {
    ...catalog,
    skills: catalog.skills.filter((skill) => skill.path !== path),
  };
}

export function canDeleteInstalledSkill(skill: InstalledSkillCard): boolean {
  return skill.scope === "user" || skill.scope === "repo";
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

function resolveNullableText(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function resolvePluginName(name: string, displayName: string | null): string {
  const normalizedDisplayName = displayName?.trim() ?? "";
  return normalizedDisplayName.length > 0 ? normalizedDisplayName : name.trim();
}

function resolveMarketplaceDisplayName(name: string, displayName: string | null): string {
  if (name === OFFICIAL_MARKETPLACE_NAME) {
    return "Codex official";
  }
  const normalizedDisplayName = displayName?.trim() ?? "";
  return normalizedDisplayName.length > 0 ? normalizedDisplayName : name.trim();
}

function resolvePluginCategory(category: string | null): string {
  const normalized = category?.trim() ?? "";
  return normalized.length > 0 ? normalized : DEFAULT_PLUGIN_CATEGORY;
}

function isMarketplacePluginVisible(
  marketplaceName: string,
  plugin: PluginListResponse["marketplaces"][number]["plugins"][number],
): boolean {
  if (!HIDDEN_MARKETPLACE_NAMES.has(marketplaceName)) {
    return true;
  }
  return plugin.installed || plugin.enabled;
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

function compareOptionLabels(left: MarketplaceFilterOption, right: MarketplaceFilterOption): number {
  if (left.id === OFFICIAL_MARKETPLACE_NAME) return -1;
  if (right.id === OFFICIAL_MARKETPLACE_NAME) return 1;
  return left.label.localeCompare(right.label, "zh-CN", { sensitivity: "base" });
}

function compareMarketplacePlugins(left: MarketplacePluginCard, right: MarketplacePluginCard): number {
  return Number(right.installed) - Number(left.installed)
    || left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" })
    || left.id.localeCompare(right.id, "zh-CN", { sensitivity: "base" });
}
