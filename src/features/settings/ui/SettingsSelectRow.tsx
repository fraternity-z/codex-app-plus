import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";

type MenuPlacement = "down" | "up";

interface MenuLayout {
  readonly placement: MenuPlacement;
  readonly maxHeight: number;
}

const MENU_GAP_PX = 8;
const MENU_VIEWPORT_PADDING_PX = 12;
const MENU_ROW_HEIGHT_PX = 40;
const MENU_HEADER_HEIGHT_PX = 36;
const MENU_VERTICAL_PADDING_PX = 18;
const MENU_MIN_HEIGHT_PX = 120;
const MENU_MAX_HEIGHT_PX = 320;
const DEFAULT_MENU_LAYOUT: MenuLayout = { placement: "down", maxHeight: MENU_MAX_HEIGHT_PX };

export interface SettingsSelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface SettingsSelectRowProps<T extends string> {
  readonly label: string;
  readonly description: string;
  readonly value: T;
  readonly options: ReadonlyArray<SettingsSelectOption<T>>;
  readonly onChange: (value: T) => void;
  readonly statusNote?: string;
}

function findSelectedOption<T extends string>(
  options: ReadonlyArray<SettingsSelectOption<T>>,
  value: T
): SettingsSelectOption<T> {
  return options.find((option) => option.value === value) ?? options[0]!;
}

function isScrollableElement(element: HTMLElement): boolean {
  const styles = window.getComputedStyle(element);
  return [styles.overflowY, styles.overflow].some((value) => value === "auto" || value === "scroll" || value === "overlay");
}

function getMenuViewportBounds(container: HTMLDivElement): { readonly top: number; readonly bottom: number } {
  let current = container.parentElement;

  while (current !== null) {
    if (isScrollableElement(current)) {
      const bounds = current.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom };
    }
    current = current.parentElement;
  }

  return { top: 0, bottom: window.innerHeight };
}

function measureMenuLayout(container: HTMLDivElement, optionCount: number): MenuLayout {
  const bounds = container.getBoundingClientRect();
  const viewportBounds = getMenuViewportBounds(container);
  const estimatedHeight = MENU_HEADER_HEIGHT_PX + MENU_VERTICAL_PADDING_PX + optionCount * MENU_ROW_HEIGHT_PX;
  const availableBelow = Math.max(viewportBounds.bottom - bounds.bottom - MENU_VIEWPORT_PADDING_PX, MENU_MIN_HEIGHT_PX);
  const availableAbove = Math.max(bounds.top - viewportBounds.top - MENU_VIEWPORT_PADDING_PX, MENU_MIN_HEIGHT_PX);
  const shouldOpenUp = availableBelow < estimatedHeight && availableAbove >= availableBelow;
  const availableHeight = shouldOpenUp ? availableAbove : availableBelow;

  return {
    placement: shouldOpenUp ? "up" : "down",
    maxHeight: Math.max(Math.min(availableHeight - MENU_GAP_PX, MENU_MAX_HEIGHT_PX), MENU_MIN_HEIGHT_PX),
  };
}

function useSettingsSelectMenuLayout(optionCount: number, menuOpen: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuLayout, setMenuLayout] = useState<MenuLayout>(DEFAULT_MENU_LAYOUT);
  const updateMenuLayout = useCallback(() => {
    const container = containerRef.current;
    if (container !== null) {
      setMenuLayout(measureMenuLayout(container, optionCount));
    }
  }, [optionCount]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    updateMenuLayout();
    window.addEventListener("resize", updateMenuLayout);
    window.addEventListener("scroll", updateMenuLayout, true);
    return () => {
      window.removeEventListener("resize", updateMenuLayout);
      window.removeEventListener("scroll", updateMenuLayout, true);
    };
  }, [menuOpen, updateMenuLayout]);

  return { containerRef, menuLayout, updateMenuLayout };
}

function SettingsSelectMenu<T extends string>(props: {
  readonly label: string;
  readonly options: ReadonlyArray<SettingsSelectOption<T>>;
  readonly value: T;
  readonly onSelect: (value: T) => void;
  readonly layout: MenuLayout;
}): JSX.Element {
  const className = props.layout.placement === "up"
    ? "toolbar-split-menu settings-select-menu settings-select-menu-up"
    : "toolbar-split-menu settings-select-menu";

  return (
    <div className={className} role="menu" aria-label={props.label} style={{ maxHeight: `${props.layout.maxHeight}px` }}>
      <div className="toolbar-menu-title">{props.label}</div>
      <div className="toolbar-menu-list">
        {props.options.map((option) => {
          const selected = option.value === props.value;
          const className = selected ? "toolbar-menu-item toolbar-menu-item-active" : "toolbar-menu-item";
          return (
            <button key={option.value} type="button" className={className} role="menuitemradio" aria-checked={selected} onClick={() => props.onSelect(option.value)}>
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
  const { containerRef, menuLayout, updateMenuLayout } = useSettingsSelectMenuLayout(props.options.length, menuOpen);
  const selectedOption = findSelectedOption(props.options, props.value);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const handleSelect = useCallback(
    (value: T) => {
      props.onChange(value);
      closeMenu();
    },
    [closeMenu, props.onChange]
  );

  useToolbarMenuDismissal(menuOpen, containerRef, closeMenu);

  const toggleMenu = useCallback(() => {
    if (!menuOpen) {
      updateMenuLayout();
    }
    setMenuOpen((value) => !value);
  }, [menuOpen, updateMenuLayout]);

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
        <button type="button" className="settings-select-trigger" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`${props.label}：${selectedOption.label}`} onClick={toggleMenu}>
          <span className="settings-select-label">{selectedOption.label}</span>
          <OfficialChevronRightIcon className={menuOpen ? "settings-select-caret settings-select-caret-open" : "settings-select-caret"} />
        </button>
        {menuOpen ? <SettingsSelectMenu label={props.label} options={props.options} value={props.value} onSelect={handleSelect} layout={menuLayout} /> : null}
      </div>
    </div>
  );
}
