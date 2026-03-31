export interface ComposerCommandPaletteItem {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly disabled: boolean;
  readonly meta: string | null;
}

interface ComposerCommandPaletteProps {
  readonly open: boolean;
  readonly title: string;
  readonly items: ReadonlyArray<ComposerCommandPaletteItem>;
  readonly selectedIndex: number;
  readonly onSelectItem: (index: number) => void;
  readonly onHoverItem: (index: number) => void;
}

export function ComposerCommandPalette(props: ComposerCommandPaletteProps): JSX.Element | null {
  if (!props.open) {
    return null;
  }

  return (
    <div className="composer-command-palette" role="menu" aria-label={props.title}>
      <div className="composer-command-palette-title">{props.title}</div>
      <div className="composer-command-palette-list">
        {props.items.map((item, index) => {
          const className = getItemClassName(index === props.selectedIndex, item.disabled);
          return (
            <button
              key={item.key}
              type="button"
              className={className}
              role="menuitem"
              aria-disabled={item.disabled}
              disabled={item.disabled}
              onMouseEnter={() => props.onHoverItem(index)}
              onClick={() => props.onSelectItem(index)}
            >
              <span className="composer-command-palette-copy">
                <span className="composer-command-palette-label">{item.label}</span>
              </span>
              <span className="composer-command-palette-detail" aria-hidden="true">
                <span className="composer-command-palette-description">{item.description}</span>
                {item.meta === null ? null : <span className="composer-command-palette-meta">{item.meta}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getItemClassName(selected: boolean, disabled: boolean): string {
  const names = ["composer-command-palette-item"];
  if (selected) {
    names.push("composer-command-palette-item-selected");
  }
  if (disabled) {
    names.push("composer-command-palette-item-disabled");
  }
  return names.join(" ");
}
