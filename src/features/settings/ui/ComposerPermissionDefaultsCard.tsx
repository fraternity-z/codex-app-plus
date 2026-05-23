import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { AppPreferencesController } from "../hooks/useAppPreferences";
import type { ComposerApprovalPolicy } from "../../composer/model/composerPermission";
import { useI18n, type MessageKey } from "../../../i18n";
import type { AgentEnvironment } from "../../../bridge/types";
import type { WriteProjectPermissionConfigInput } from "../../../bridge/types";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { SandboxMode } from "../../../protocol/generated/v2/SandboxMode";
import type { WorkspaceRoot } from "../../workspace";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import type { ConfigSnapshotMutationResult } from "../config/configOperations";
import { readUserConfigWriteTarget } from "../config/configWriteTarget";
import {
  applyPermissionConfigValue,
  createPermissionConfigEdit,
  createProjectConfigCwd,
  readPermissionConfigValues,
  readProjectConfigWriteTarget,
  type PermissionConfigScope,
  type PermissionConfigValues,
  type PermissionConfigWriteTarget,
} from "../config/permissionConfig";
import {
  type MenuLayout,
  useSettingsSelectMenuLayout,
} from "./settingsSelectMenuLayout";
import { SettingsSelectRow, type SettingsSelectOption } from "./SettingsSelectRow";

type Translator = (key: MessageKey, variables?: Record<string, string | number>) => string;
type PermissionConfigKey = keyof PermissionConfigValues;
const CONFIG_VERSION_CONFLICT_MESSAGE = "Configuration was modified since last read";
const CONFIG_WRITE_MAX_ATTEMPTS = 3;

function createComposerApprovalPolicyOptions(
  t: Translator
): ReadonlyArray<SettingsSelectOption<ComposerApprovalPolicy>> {
  return [
    { value: "untrusted", label: t("settings.config.composer.approvalPolicy.options.untrusted") },
    { value: "on-failure", label: t("settings.config.composer.approvalPolicy.options.onFailure") },
    { value: "on-request", label: t("settings.config.composer.approvalPolicy.options.onRequest") },
    { value: "never", label: t("settings.config.composer.approvalPolicy.options.never") },
  ];
}

function createSandboxModeOptions(t: Translator): ReadonlyArray<SettingsSelectOption<SandboxMode>> {
  return [
    { value: "read-only", label: t("settings.config.composer.sandboxMode.options.readOnly") },
    { value: "workspace-write", label: t("settings.config.composer.sandboxMode.options.workspaceWrite") },
    { value: "danger-full-access", label: t("settings.config.composer.sandboxMode.options.dangerFullAccess") },
  ];
}

function getScopeLabel(
  scope: PermissionConfigScope,
  selectedRoot: WorkspaceRoot | null,
  t: Translator,
): string {
  if (scope === "project") {
    return selectedRoot?.name ?? t("settings.config.composer.sourceNoProject");
  }
  return t("settings.config.composer.sourceUserConfig");
}

function getWriteTarget(
  scope: PermissionConfigScope,
  snapshot: ConfigReadResponse | null,
  selectedRoot: WorkspaceRoot | null,
  agentEnvironment: AgentEnvironment,
): PermissionConfigWriteTarget | null {
  if (scope === "project") {
    if (selectedRoot === null) {
      return null;
    }
    return readProjectConfigWriteTarget(snapshot, selectedRoot, agentEnvironment);
  }
  const userTarget = readUserConfigWriteTarget(snapshot);
  return {
    cwd: null,
    filePath: userTarget.filePath,
    expectedVersion: userTarget.expectedVersion,
  };
}

function isConfigVersionConflictError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(CONFIG_VERSION_CONFLICT_MESSAGE);
}

function createProjectPermissionConfigInput<K extends PermissionConfigKey>(
  agentEnvironment: AgentEnvironment,
  filePath: string,
  key: K,
  value: PermissionConfigValues[K],
): WriteProjectPermissionConfigInput {
  return {
    agentEnvironment,
    filePath,
    approvalPolicy: key === "approvalPolicy" ? String(value) : null,
    sandboxMode: key === "sandboxMode" ? String(value) : null,
    networkAccess: key === "networkAccess" ? Boolean(value) : null,
  };
}

async function batchWriteUserPermissionConfigValue<K extends PermissionConfigKey>(
  key: K,
  value: PermissionConfigValues[K],
  configSnapshot: ConfigReadResponse | null,
  selectedRoot: WorkspaceRoot | null,
  agentEnvironment: AgentEnvironment,
  refreshConfigSnapshot: () => Promise<ConfigReadResponse>,
  batchWriteConfigSnapshot: (params: ConfigBatchWriteParams) => Promise<ConfigSnapshotMutationResult>,
): Promise<void> {
  let snapshot: ConfigReadResponse | null = configSnapshot;

  for (let attempt = 0; attempt < CONFIG_WRITE_MAX_ATTEMPTS; attempt += 1) {
    const writeTarget = getWriteTarget("user", snapshot, selectedRoot, agentEnvironment);
    try {
      await batchWriteConfigSnapshot({
        edits: [createPermissionConfigEdit(key, value)],
        filePath: writeTarget?.filePath ?? null,
        expectedVersion: writeTarget?.expectedVersion ?? null,
        reloadUserConfig: true,
      });
      return;
    } catch (error) {
      if (!isConfigVersionConflictError(error) || attempt === CONFIG_WRITE_MAX_ATTEMPTS - 1) {
        throw error;
      }
      snapshot = await refreshConfigSnapshot();
    }
  }

  throw new Error("配置写入重试次数已用尽");
}

function ConfigSourceMenu(props: {
  readonly scope: PermissionConfigScope;
  readonly selectedRoot: WorkspaceRoot | null;
  readonly t: Translator;
  readonly layout: MenuLayout;
  readonly menuRef: RefObject<HTMLDivElement>;
  onSelect: (scope: PermissionConfigScope) => void;
}): JSX.Element {
  const projectDisabled = props.selectedRoot === null;
  return (
    <div
      ref={props.menuRef}
      className="toolbar-split-menu settings-select-menu settings-config-source-menu"
      role="menu"
      aria-label={props.t("settings.config.composer.sourceMenuLabel")}
      style={{
        position: "fixed",
        top: `${props.layout.top}px`,
        left: `${props.layout.left}px`,
        right: "auto",
        bottom: "auto",
        width: `${props.layout.width}px`,
        maxHeight: `${props.layout.maxHeight}px`,
        zIndex: "var(--z-layer-context-menu)",
      }}
    >
      <div className="settings-config-source-menu-title">
        {props.t("settings.config.composer.sourceProjectConfig")}
      </div>
      <button
        type="button"
        className={props.scope === "project" ? "toolbar-menu-item toolbar-menu-item-active" : "toolbar-menu-item"}
        role="menuitemradio"
        aria-checked={props.scope === "project"}
        aria-disabled={projectDisabled}
        disabled={projectDisabled}
        onClick={() => props.onSelect("project")}
      >
        <span className="settings-select-check">{props.scope === "project" ? "✓" : ""}</span>
        <span className="toolbar-menu-label">
          {props.selectedRoot?.name ?? props.t("settings.config.composer.sourceNoProject")}
        </span>
      </button>
      <div className="settings-config-source-menu-title">
        {props.t("settings.config.composer.sourceGlobalConfig")}
      </div>
      <button
        type="button"
        className={props.scope === "user" ? "toolbar-menu-item toolbar-menu-item-active" : "toolbar-menu-item"}
        role="menuitemradio"
        aria-checked={props.scope === "user"}
        onClick={() => props.onSelect("user")}
      >
        <span className="settings-select-check">{props.scope === "user" ? "✓" : ""}</span>
        <span className="toolbar-menu-label">{props.t("settings.config.composer.sourceUserConfig")}</span>
      </button>
    </div>
  );
}

function ConfigSourceSelector(props: {
  readonly scope: PermissionConfigScope;
  readonly selectedRoot: WorkspaceRoot | null;
  readonly disabled?: boolean;
  onChange: (scope: PermissionConfigScope) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const { containerRef, menuLayout, updateMenuLayout } =
    useSettingsSelectMenuLayout({ menuOpen, optionCount: 4 });
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const handleSelect = useCallback((scope: PermissionConfigScope) => {
    props.onChange(scope);
    closeMenu();
  }, [closeMenu, props]);

  useToolbarMenuDismissal(menuOpen, containerRef, closeMenu, [menuRef]);

  const toggleMenu = useCallback(() => {
    if (props.disabled) {
      return;
    }
    if (!menuOpen) {
      updateMenuLayout();
    }
    setMenuOpen((value) => !value);
  }, [menuOpen, props.disabled, updateMenuLayout]);

  const label = getScopeLabel(props.scope, props.selectedRoot, t);
  const menuNode = menuOpen && typeof document !== "undefined"
    ? createPortal(
      <ConfigSourceMenu
        scope={props.scope}
        selectedRoot={props.selectedRoot}
        t={t}
        layout={menuLayout}
        menuRef={menuRef}
        onSelect={handleSelect}
      />,
      document.body,
    )
    : null;

  return (
    <div
      className="settings-config-source-control"
      data-menu-open={menuOpen ? "true" : undefined}
      data-menu-placement={menuLayout.placement}
      ref={containerRef}
    >
      <button
        type="button"
        className="settings-config-source-trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`${t("settings.config.composer.sourceMenuLabel")}：${label}`}
        disabled={props.disabled}
        onClick={toggleMenu}
      >
        <span>{label}</span>
        <OfficialChevronRightIcon
          className={
            menuOpen
              ? "settings-config-source-caret settings-config-source-caret-open"
              : "settings-config-source-caret"
          }
        />
      </button>
      {menuNode}
    </div>
  );
}

function ToggleSwitch(props: {
  readonly checked: boolean;
  readonly label: string;
  readonly disabled?: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={props.checked ? "settings-toggle settings-toggle-on" : "settings-toggle"}
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.disabled ? undefined : props.onToggle}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

function NetworkAccessRow(props: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  onToggle: () => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{t("settings.config.composer.networkAccess.label")}</strong>
        <p>{t("settings.config.composer.networkAccess.description")}</p>
      </div>
      <div className="settings-row-control">
        <ToggleSwitch
          checked={props.checked}
          disabled={props.disabled}
          label={t("settings.config.composer.networkAccess.label")}
          onToggle={props.onToggle}
        />
      </div>
    </div>
  );
}

export function ComposerPermissionDefaultsCard(props: {
  readonly preferences: AppPreferencesController;
  readonly agentEnvironment: AgentEnvironment;
  readonly configSnapshot: ConfigReadResponse | null;
  readonly selectedRoot: WorkspaceRoot | null;
  onOpenConfigToml: (filePath?: string | null) => Promise<void>;
  writeProjectPermissionConfig: (input: WriteProjectPermissionConfigInput) => Promise<unknown>;
  refreshConfigSnapshot: (cwd?: string | null) => Promise<ConfigReadResponse>;
  batchWriteConfigSnapshot: (params: ConfigBatchWriteParams) => Promise<ConfigSnapshotMutationResult>;
}): JSX.Element {
  const { t } = useI18n();
  const [scope, setScope] = useState<PermissionConfigScope>("user");
  const [projectSnapshot, setProjectSnapshot] = useState<ConfigReadResponse | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const composerApprovalOptions = createComposerApprovalPolicyOptions(t);
  const sandboxModeOptions = createSandboxModeOptions(t);

  useEffect(() => {
    if (scope === "project" && props.selectedRoot === null) {
      setScope("user");
    }
  }, [props.selectedRoot, scope]);

  useEffect(() => {
    if (scope !== "project" || props.selectedRoot === null) {
      return;
    }
    let cancelled = false;
    setLoadingProject(true);
    setStatus(null);
    void (async () => {
      try {
        const selectedRoot = props.selectedRoot;
        if (selectedRoot === null) {
          return;
        }
        const cwd = createProjectConfigCwd(selectedRoot, props.agentEnvironment);
        const snapshot = await props.refreshConfigSnapshot(cwd);
        if (!cancelled) {
          setProjectSnapshot(snapshot);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(t("settings.config.composer.loadFailed", {
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      } finally {
        if (!cancelled) {
          setLoadingProject(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.agentEnvironment, props.refreshConfigSnapshot, props.selectedRoot, scope, t]);

  const activeSnapshot = scope === "project" ? projectSnapshot : props.configSnapshot;
  const values = useMemo(() => readPermissionConfigValues(activeSnapshot), [activeSnapshot]);
  const target = useMemo(
    () => getWriteTarget(scope, activeSnapshot, props.selectedRoot, props.agentEnvironment),
    [activeSnapshot, props.agentEnvironment, props.selectedRoot, scope],
  );
  const busy = saving || loadingProject;

  const saveValue = useCallback(async <K extends PermissionConfigKey>(
    key: K,
    value: PermissionConfigValues[K],
  ) => {
    const writeTarget = getWriteTarget(scope, activeSnapshot, props.selectedRoot, props.agentEnvironment);
    if (writeTarget === null) {
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      if (scope === "project" && writeTarget.cwd !== null) {
        if (writeTarget.filePath === null) {
          return;
        }
        await props.writeProjectPermissionConfig(
          createProjectPermissionConfigInput(props.agentEnvironment, writeTarget.filePath, key, value),
        );
        setProjectSnapshot((current) => applyPermissionConfigValue(current ?? activeSnapshot, key, value));
      } else {
        await batchWriteUserPermissionConfigValue(
          key,
          value,
          activeSnapshot,
          props.selectedRoot,
          props.agentEnvironment,
          () => props.refreshConfigSnapshot(),
          props.batchWriteConfigSnapshot,
        );
        setProjectSnapshot(null);
      }
      setStatus(t("settings.config.composer.savedMessage"));
    } catch (error) {
      setStatus(t("settings.config.composer.saveFailed", {
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setSaving(false);
    }
  }, [
    activeSnapshot,
    props.agentEnvironment,
    props.batchWriteConfigSnapshot,
    props.refreshConfigSnapshot,
    props.selectedRoot,
    props.writeProjectPermissionConfig,
    scope,
    t,
  ]);

  const openCurrentConfig = useCallback(() => {
    void props.onOpenConfigToml(target?.filePath ?? null);
  }, [props, target]);

  return (
    <section className="settings-page-section settings-config-composer-section">
      <h2 className="settings-section-title">{t("settings.config.composer.title")}</h2>
      <div className="settings-config-source-row">
        <ConfigSourceSelector
          scope={scope}
          selectedRoot={props.selectedRoot}
          disabled={saving}
          onChange={setScope}
        />
        <button
          type="button"
          className="settings-config-open-link"
          onClick={openCurrentConfig}
        >
          {t("settings.config.composer.openConfigToml")}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
      {status !== null ? <p className="settings-row-note settings-config-status">{status}</p> : null}
      <section className="settings-card settings-config-preferences-card">
        <SettingsSelectRow
          label={t("settings.config.composer.approvalPolicy.label")}
          description={t("settings.config.composer.approvalPolicy.description")}
          value={values.approvalPolicy}
          options={composerApprovalOptions}
          disabled={busy}
          onChange={(value) => void saveValue("approvalPolicy", value)}
        />
        <SettingsSelectRow
          label={t("settings.config.composer.sandboxMode.label")}
          description={t("settings.config.composer.sandboxMode.description")}
          value={values.sandboxMode}
          options={sandboxModeOptions}
          disabled={busy}
          onChange={(value) => void saveValue("sandboxMode", value)}
        />
        <NetworkAccessRow
          checked={values.networkAccess}
          disabled={busy}
          onToggle={() => void saveValue("networkAccess", !values.networkAccess)}
        />
      </section>
    </section>
  );
}
