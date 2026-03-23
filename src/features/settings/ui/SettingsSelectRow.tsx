import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";
import {
  type MenuLayout,
  useSettingsSelectMenuLayout,
} from "./settingsSelectMenuLayout";

export interface SettingsSelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

interface SettingsSelectRowProps<T extends string> {
  readonly label: string;
  readonly description: string;
  readonly value: T;
  readonly options: ReadonlyArray<SettingsSelectOption<T>>;
  readonly onChange: (value: T) => void;
  readonly statusNote?: string;
  readonly disabled?: boolean;
}

function findSelectedOption<T extends string>(
  options: ReadonlyArray<SettingsSelectOption<T>>,
  value: T
): SettingsSelectOption<T> {
  return options.find((option) => option.value === value) ?? options[0]!;
}

function SettingsSelectMenu<T extends string>(props: {
  readonly label: string;
  readonly options: ReadonlyArray<SettingsSelectOption<T>>;
  readonly value: T;
  readonly onSelect: (value: T) => void;
  readonly layout: MenuLayout;
  readonly menuRef: RefObject<HTMLDivElement>;
}): JSX.Element {
  const className = props.layout.placement === "up"
    ? "toolbar-split-menu settings-select-menu settings-select-menu-up"
    : "toolbar-split-menu settings-select-menu";
  const style = {
    position: "fixed" as const,
    top: `${props.layout.top}px`,
    left: `${props.layout.left}px`,
    right: "auto",
    bottom: "auto",
    width: `${props.layout.width}px`,
    maxHeight: `${props.layout.maxHeight}px`,
    zIndex: 120,
  };

  return (
    <div ref={props.menuRef} className={className} role="menu" aria-label={props.label} style={style}>
      <div className="toolbar-menu-title">{props.label}</div>
      <div className="toolbar-menu-list">
        {props.options.map((option) => {
          const selected = option.value === props.value;
          const className = selected ? "toolbar-menu-item toolbar-menu-item-active" : "toolbar-menu-item";
          return (
            <button
              key={option.value}
              type="button"
              className={className}
              role="menuitemradio"
              aria-checked={selected}
              aria-disabled={option.disabled === true}
              disabled={option.disabled}
              onClick={() => props.onSelect(option.value)}
            >
              <span className="settings-select-check">{selected ? "✓" : ""}</span>
              <span className="toolbar-menu-label">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsSelectRow<T extends string>(props: SettingsSelectRowProps<T>): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const { containerRef, menuLayout, updateMenuLayout } =
    useSettingsSelectMenuLayout({
      menuOpen,
      optionCount: props.options.length,
    });
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedOption = findSelectedOption(props.options, props.value);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const handleSelect = useCallback(
    (value: T) => {
      props.onChange(value);
      closeMenu();
    },
    [closeMenu, props.onChange]
  );

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
  const menuNode = useMemo(() => {
    if (!menuOpen || typeof document === "undefined") {
      return null;
    }
    return createPortal(
      <SettingsSelectMenu
        label={props.label}
        options={props.options}
        value={props.value}
        onSelect={handleSelect}
        layout={menuLayout}
        menuRef={menuRef}
      />,
      document.body
    );
  }, [handleSelect, menuLayout, menuOpen, props.label, props.options, props.value]);

  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{props.label}</strong>
        <p>{props.description}</p>
        {props.statusNote ? <p className="settings-row-note">{props.statusNote}</p> : null}
      </div>
      <div
        className="settings-row-control"
        data-menu-open={menuOpen ? "true" : undefined}
        data-menu-placement={menuLayout.placement}
        ref={containerRef}
      >
        <button
          type="button"
          className="settings-select-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`${props.label}：${selectedOption.label}`}
          disabled={props.disabled}
          onClick={toggleMenu}
        >
          <span className="settings-select-label">{selectedOption.label}</span>
          <OfficialChevronRightIcon
            className={
              menuOpen
                ? "settings-select-caret settings-select-caret-open"
                : "settings-select-caret"
            }
          />
        </button>
      </div>
      {menuNode}
    </div>
  );
}
