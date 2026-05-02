import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { GitWorkspaceDiffOutput } from "../../../bridge/types";
import type { DiffViewStyle } from "../hooks/useDiffSidebarLayout";
import { createGitDiffKey } from "../model/gitDiffKey";
import { WorkspaceDiffViewerCard } from "./WorkspaceDiffViewerCard";

const INITIAL_VIEWPORT_HEIGHT = 720;
const CARD_ESTIMATED_HEIGHT = 360;
const CARD_OVERSCAN = 4;

interface WorkspaceDiffViewerProps {
  readonly busy: boolean;
  readonly error: string | null;
  readonly items: ReadonlyArray<GitWorkspaceDiffOutput>;
  readonly loading: boolean;
  readonly onLoadDiff: (item: GitWorkspaceDiffOutput) => Promise<void>;
  readonly onDiscardPaths: (paths: ReadonlyArray<string>, deleteUntracked: boolean) => Promise<void>;
  readonly onStagePaths: (paths: ReadonlyArray<string>) => Promise<void>;
  readonly onUnstagePaths: (paths: ReadonlyArray<string>) => Promise<void>;
  readonly showSectionLabel: boolean;
  readonly viewStyle?: DiffViewStyle;
}

function createItemKey(item: GitWorkspaceDiffOutput): string {
  return createGitDiffKey(item.path, item.staged);
}

function ErrorState(props: { readonly error: string | null }): JSX.Element | null {
  if (props.error === null) {
    return null;
  }
  return <div className="git-banner git-banner-error">{props.error}</div>;
}

function LoadingOverlay(props: { readonly hasItems: boolean; readonly loading: boolean }): JSX.Element | null {
  if (!props.loading || !props.hasItems) {
    return null;
  }
  return <div className="workspace-diff-viewer-loading-overlay">正在刷新差异…</div>;
}

function EmptyState(props: { readonly error: string | null; readonly hasItems: boolean; readonly loading: boolean }): JSX.Element | null {
  if (props.error !== null || props.loading || props.hasItems) {
    return null;
  }
  return (
    <div className="workspace-diff-empty-state">
      <h3 className="workspace-diff-empty-title">当前分组没有可展示的差异</h3>
      <p className="workspace-diff-empty-body">修改文件后会在这里显示连续 diff 视图。</p>
    </div>
  );
}

function pruneCollapsedKeys(
  current: ReadonlySet<string>,
  itemKeys: ReadonlySet<string>,
): ReadonlySet<string> {
  if (current.size === 0) {
    return current;
  }
  let changed = false;
  const next = new Set<string>();
  for (const key of current) {
    if (!itemKeys.has(key)) {
      changed = true;
      continue;
    }
    next.add(key);
  }
  return changed ? next : current;
}

function useCollapsedCards(items: ReadonlyArray<GitWorkspaceDiffOutput>) {
  const itemKeys = useMemo(() => new Set(items.map(createItemKey)), [items]);
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(() => new Set<string>());

  useEffect(() => {
    setCollapsedKeys((current) => pruneCollapsedKeys(current, itemKeys));
  }, [itemKeys]);

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  return { collapsedKeys, toggleCollapsed };
}

function useMeasuredRows(items: ReadonlyArray<GitWorkspaceDiffOutput>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeByKeyRef = useRef(new Map<string, HTMLDivElement>());
  const observerByKeyRef = useRef(new Map<string, ResizeObserver>());
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getItemKey: (index) => createItemKey(items[index]!),
    getScrollElement: () => containerRef.current,
    initialRect: { width: 0, height: INITIAL_VIEWPORT_HEIGHT },
    estimateSize: () => CARD_ESTIMATED_HEIGHT,
    overscan: CARD_OVERSCAN,
  });

  const setRowRef = useCallback((key: string, node: HTMLDivElement | null) => {
    const previousNode = nodeByKeyRef.current.get(key) ?? null;
    if (previousNode !== null && previousNode !== node) {
      observerByKeyRef.current.get(key)?.disconnect();
      observerByKeyRef.current.delete(key);
      nodeByKeyRef.current.delete(key);
    }
    if (node === null) {
      return;
    }
    nodeByKeyRef.current.set(key, node);
    rowVirtualizer.measureElement(node);
    if (observerByKeyRef.current.has(key)) {
      return;
    }
    const observer = new ResizeObserver(() => {
      rowVirtualizer.measureElement(node);
    });
    observer.observe(node);
    observerByKeyRef.current.set(key, observer);
  }, [rowVirtualizer]);

  useEffect(() => {
    return () => {
      for (const observer of observerByKeyRef.current.values()) {
        observer.disconnect();
      }
      observerByKeyRef.current.clear();
      nodeByKeyRef.current.clear();
    };
  }, []);

  return { containerRef, rowVirtualizer, setRowRef };
}

export function WorkspaceDiffViewer(props: WorkspaceDiffViewerProps): JSX.Element {
  const { collapsedKeys, toggleCollapsed } = useCollapsedCards(props.items);
  const { containerRef, rowVirtualizer, setRowRef } = useMeasuredRows(props.items);
  const hasItems = props.items.length > 0;

  return (
    <section className="workspace-diff-viewer" aria-label="工作区差异列表">
      <ErrorState error={props.error} />
      <LoadingOverlay hasItems={hasItems} loading={props.loading} />
      <EmptyState error={props.error} hasItems={hasItems} loading={props.loading} />
      {!hasItems ? null : (
        <div className="workspace-diff-viewer-scroll" ref={containerRef}>
          <div
            className="workspace-diff-viewer-list"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = props.items[virtualRow.index];
              if (item === undefined) {
                return null;
              }
              const itemKey = createItemKey(item);
              return (
                <div
                  key={itemKey}
                  className="workspace-diff-viewer-row"
                  data-index={virtualRow.index}
                  ref={(node) => setRowRef(itemKey, node)}
                  style={{ transform: `translate3d(0, ${virtualRow.start}px, 0)` }}
                >
                  <WorkspaceDiffViewerCard
                    busy={props.busy}
                    diffKey={itemKey}
                    expanded={!collapsedKeys.has(itemKey)}
                    item={item}
                    onDiscardPaths={props.onDiscardPaths}
                    onLoadDiff={props.onLoadDiff}
                    onStagePaths={props.onStagePaths}
                    onToggleExpanded={toggleCollapsed}
                    onUnstagePaths={props.onUnstagePaths}
                    showSectionLabel={props.showSectionLabel}
                    viewStyle={props.viewStyle ?? "unified"}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
