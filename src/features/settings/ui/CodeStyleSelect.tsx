import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import {
  CODE_STYLE_OPTIONS,
  type CodeStyleId,
  getCodeStyleTheme,
} from "../model/codeStyleCatalog";
import {
  type MenuLayout,
  useSettingsSelectMenuLayout,
} from "./settingsSelectMenuLayout";

const CODE_STYLE_BADGE_LABEL = "Aa";

const CODE_STYLE_MENU_METRICS = {
  maxHeight: 520,
  maxWidth: 320,
  minWidth: 260,
  rowHeight: 52,
  verticalPadding: 12,
} as const;

interface CodeStyleSelectProps {
  readonly label: string;
  readonly value: CodeStyleId;
  onChange: (value: CodeStyleId) => void;
}

function CodeStyleBadge(props: { readonly codeStyle: CodeStyleId }): JSX.Element {
  const theme = getCodeStyleTheme(props.codeStyle);
  return (
    <span
      className="settings-code-style-badge"
      aria-hidden="true"
      style={{
        backgroundColor: theme.badgeBackground,
        color: theme.badgeForeground,
      }}
    >
      {CODE_STYLE_BADGE_LABEL}
    </span>
  );
}

function createMenuClassName(layout: MenuLayout): string {
  if (layout.placement === "up") {
    return "toolbar-split-menu settings-select-menu settings-code-style-menu settings-select-menu-up";
  }
  return "toolbar-split-menu settings-select-menu settings-code-style-menu";
}

function createMenuStyle(layout: MenuLayout) {
  return {
    position: "fixed" as const,
    top: `${layout.top}px`,
    left: `${layout.left}px`,
    right: "auto",
    bottom: "auto",
    width: `${layout.width}px`,
    maxHeight: `${layout.maxHeight}px`,
    zIndex: "var(--z-layer-context-menu)",
  };
}

function CodeStyleMenu(props: {
  readonly label: string;
  readonly layout: MenuLayout;
  readonly menuRef: RefObject<HTMLDivElement>;
  readonly onSelect: (value: CodeStyleId) => void;
  readonly value: CodeStyleId;
}): JSX.Element {
  return (
    <div
      ref={props.menuRef}
      className={createMenuClassName(props.layout)}
      role="menu"
      aria-label={props.label}
      style={createMenuStyle(props.layout)}
    >
      <div className="toolbar-menu-title">{props.label}</div>
      <div className="toolbar-menu-list">
        {CODE_STYLE_OPTIONS.map((option) => {
          const selected = option.id === props.value;
          const className = selected
            ? "toolbar-menu-item toolbar-menu-item-active settings-code-style-option"
            : "toolbar-menu-item settings-code-style-option";
          return (
            <button
              key={option.id}
              type="button"
              className={className}
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => props.onSelect(option.id)}
            >
              <CodeStyleBadge codeStyle={option.id} />
              <span className="settings-code-style-option-label">
                {option.id}
              </span>
              <span
                className="settings-code-style-option-check"
                aria-hidden="true"
              >
                {selected ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CodeStyleSelect(props: CodeStyleSelectProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { containerRef, menuLayout, updateMenuLayout } =
    useSettingsSelectMenuLayout({
      menuOpen,
      metrics: CODE_STYLE_MENU_METRICS,
      optionCount: CODE_STYLE_OPTIONS.length,
    });
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const handleSelect = useCallback(
    (value: CodeStyleId) => {
      props.onChange(value);
      closeMenu();
    },
    [closeMenu, props.onChange],
  );

  useToolbarMenuDismissal(menuOpen, containerRef, closeMenu, [menuRef]);

  const toggleMenu = useCallback(() => {
    if (!menuOpen) {
      updateMenuLayout();
    }
    setMenuOpen((value) => !value);
  }, [menuOpen, updateMenuLayout]);
  const menuNode = useMemo(() => {
    if (!menuOpen || typeof document === "undefined") {
      return null;
    }
    return createPortal(
      <CodeStyleMenu
        label={props.label}
        layout={menuLayout}
        menuRef={menuRef}
        onSelect={handleSelect}
        value={props.value}
      />,
      document.body,
    );
  }, [handleSelect, menuLayout, menuOpen, props.label, props.value]);

  return (
    <div className="settings-code-style-select" ref={containerRef}>
      <button
        type="button"
        className="settings-code-style-trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`${props.label}：${props.value}`}
        onClick={toggleMenu}
      >
        <CodeStyleBadge codeStyle={props.value} />
        <span className="settings-code-style-trigger-text">{props.value}</span>
        <OfficialChevronRightIcon
          className={
            menuOpen
              ? "settings-code-style-caret settings-code-style-caret-open"
              : "settings-code-style-caret"
          }
        />
      </button>
      {menuNode}
    </div>
  );
}
