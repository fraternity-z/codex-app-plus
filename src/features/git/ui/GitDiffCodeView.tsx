import { useCallback, useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import {
  collapseDiffRows,
  parseUnifiedDiffCached,
  type CollapsedDiffRow,
  type DiffDisplayRow,
  type ParsedDiffFile,
  type ParsedDiffHunk,
  type ParsedDiffLine
} from "../model/diffPreviewModel";
import type { DiffViewStyle } from "../hooks/useDiffSidebarLayout";
import { HighlightedCodeContent } from "./diffCodeHighlight";

interface GitDiffCodeViewProps {
  readonly diff?: string;
  readonly parsed?: ParsedDiffFile;
  readonly path?: string;
  readonly viewStyle?: DiffViewStyle;
  readonly wordWrap?: boolean;
  readonly richPreview?: boolean;
  readonly wordDiff?: boolean;
}

interface DiffScrollFrameProps {
  readonly scrollClassName: string;
  readonly wrapLines: boolean;
  readonly children: ReactNode;
}

function DiffScrollFrame(props: DiffScrollFrameProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const lockRef = useRef<"viewport" | "rail" | null>(null);
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const [showHorizontalRail, setShowHorizontalRail] = useState(false);

  const syncMeasurements = useCallback(() => {
    const viewport = viewportRef.current;
    const surface = surfaceRef.current;
    const rail = railRef.current;
    if (viewport === null || surface === null) {
      setSurfaceWidth(0);
      setShowHorizontalRail(false);
      return;
    }
    const nextWidth = Math.max(surface.scrollWidth, viewport.clientWidth);
    const nextShowHorizontalRail = surface.scrollWidth > viewport.clientWidth + 1;
    setSurfaceWidth((current) => (current === nextWidth ? current : nextWidth));
    setShowHorizontalRail((current) => (current === nextShowHorizontalRail ? current : nextShowHorizontalRail));
    if (rail !== null && rail.scrollLeft !== viewport.scrollLeft) {
      rail.scrollLeft = viewport.scrollLeft;
    }
  }, []);

  useEffect(() => {
    syncMeasurements();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      syncMeasurements();
    });
    const viewport = viewportRef.current;
    const surface = surfaceRef.current;
    if (viewport !== null) {
      observer.observe(viewport);
    }
    if (surface !== null) {
      observer.observe(surface);
    }
    return () => {
      observer.disconnect();
    };
  }, [syncMeasurements]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      const rail = railRef.current;
      if (rail === null || event.deltaX === 0) {
        return;
      }
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
        return;
      }
      const max = rail.scrollWidth - rail.clientWidth;
      if (max <= 0) {
        return;
      }
      event.preventDefault();
      const next = Math.max(0, Math.min(max, rail.scrollLeft + event.deltaX));
      if (rail.scrollLeft !== next) {
        rail.scrollLeft = next;
      }
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);

  const releaseLock = useCallback((source: "viewport" | "rail") => {
    Promise.resolve().then(() => {
      if (lockRef.current === source) {
        lockRef.current = null;
      }
    });
  }, []);

  const syncScrollLeft = useCallback((source: "viewport" | "rail", value: number) => {
    const viewport = viewportRef.current;
    const rail = railRef.current;
    if (viewport === null || rail === null) {
      return;
    }
    lockRef.current = source;
    if (source === "viewport") {
      if (rail.scrollLeft !== value) {
        rail.scrollLeft = value;
      }
      releaseLock(source);
      return;
    }
    if (viewport.scrollLeft !== value) {
      viewport.scrollLeft = value;
    }
    releaseLock(source);
  }, [releaseLock]);

  const handleViewportScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (lockRef.current === "rail") {
      return;
    }
    syncScrollLeft("viewport", event.currentTarget.scrollLeft);
  }, [syncScrollLeft]);

  const handleRailScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (lockRef.current === "viewport") {
      return;
    }
    syncScrollLeft("rail", event.currentTarget.scrollLeft);
  }, [syncScrollLeft]);

  const railClassName = showHorizontalRail
    ? "workspace-diff-code-horizontal-scroll workspace-diff-code-horizontal-scroll-active"
    : "workspace-diff-code-horizontal-scroll workspace-diff-code-horizontal-scroll-inactive";

  const frameClassName = props.wrapLines
    ? "workspace-diff-code-frame workspace-diff-code-frame-wrap"
    : "workspace-diff-code-frame";

  return (
    <div className={frameClassName}>
      <div
        ref={viewportRef}
        className={`${props.scrollClassName} workspace-diff-code-scroll-viewport`}
        role="presentation"
        onScroll={handleViewportScroll}
      >
        <div ref={surfaceRef} className="workspace-diff-code-surface">
          {props.children}
        </div>
      </div>
      <div
        ref={railRef}
        className={railClassName}
        aria-hidden={false}
        onScroll={handleRailScroll}
      >
        <div className="workspace-diff-code-horizontal-spacer" style={{ width: `${surfaceWidth}px` }} />
      </div>
    </div>
  );
}

interface SplitDiffFrameProps {
  readonly leftPane: ReactNode;
  readonly rightPane: ReactNode;
  readonly wrapLines: boolean;
}

function SplitDiffFrame(props: SplitDiffFrameProps): JSX.Element {
  const leftViewportRef = useRef<HTMLDivElement | null>(null);
  const rightViewportRef = useRef<HTMLDivElement | null>(null);
  const leftSurfaceRef = useRef<HTMLDivElement | null>(null);
  const rightSurfaceRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const lockRef = useRef<"left" | "right" | "rail" | null>(null);
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const [railSpacerWidth, setRailSpacerWidth] = useState(0);
  const [showHorizontalRail, setShowHorizontalRail] = useState(false);

  const syncMeasurements = useCallback(() => {
    const leftViewport = leftViewportRef.current;
    const rightViewport = rightViewportRef.current;
    const leftSurface = leftSurfaceRef.current;
    const rightSurface = rightSurfaceRef.current;
    const rail = railRef.current;
    if (
      leftViewport === null
      || rightViewport === null
      || leftSurface === null
      || rightSurface === null
    ) {
      setSurfaceWidth(0);
      setRailSpacerWidth(0);
      setShowHorizontalRail(false);
      return;
    }
    const paneWidth = Math.max(leftViewport.clientWidth, rightViewport.clientWidth);
    const contentWidth = Math.max(leftSurface.scrollWidth, rightSurface.scrollWidth, paneWidth);
    const overflow = Math.max(0, contentWidth - paneWidth);
    const railClientWidth = rail !== null ? rail.clientWidth : paneWidth * 2;
    const nextSpacer = overflow + railClientWidth;
    const nextShowHorizontalRail = overflow > 1;
    setSurfaceWidth((current) => (current === contentWidth ? current : contentWidth));
    setRailSpacerWidth((current) => (current === nextSpacer ? current : nextSpacer));
    setShowHorizontalRail((current) => (current === nextShowHorizontalRail ? current : nextShowHorizontalRail));
    const scrollLeft = leftViewport.scrollLeft;
    if (rightViewport.scrollLeft !== scrollLeft) {
      rightViewport.scrollLeft = scrollLeft;
    }
    if (rail !== null && rail.scrollLeft !== scrollLeft) {
      rail.scrollLeft = scrollLeft;
    }
  }, []);

  useEffect(() => {
    syncMeasurements();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      syncMeasurements();
    });
    const leftViewport = leftViewportRef.current;
    const rightViewport = rightViewportRef.current;
    const leftSurface = leftSurfaceRef.current;
    const rightSurface = rightSurfaceRef.current;
    const rail = railRef.current;
    if (leftViewport !== null) {
      observer.observe(leftViewport);
    }
    if (rightViewport !== null) {
      observer.observe(rightViewport);
    }
    if (leftSurface !== null) {
      observer.observe(leftSurface);
    }
    if (rightSurface !== null) {
      observer.observe(rightSurface);
    }
    if (rail !== null) {
      observer.observe(rail);
    }
    return () => {
      observer.disconnect();
    };
  }, [syncMeasurements]);

  useEffect(() => {
    const leftViewport = leftViewportRef.current;
    const rightViewport = rightViewportRef.current;
    const targets = [leftViewport, rightViewport].filter((node): node is HTMLDivElement => node !== null);
    if (targets.length === 0) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      const rail = railRef.current;
      if (rail === null || event.deltaX === 0) {
        return;
      }
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
        return;
      }
      const max = rail.scrollWidth - rail.clientWidth;
      if (max <= 0) {
        return;
      }
      event.preventDefault();
      const next = Math.max(0, Math.min(max, rail.scrollLeft + event.deltaX));
      if (rail.scrollLeft !== next) {
        rail.scrollLeft = next;
      }
    };
    for (const target of targets) {
      target.addEventListener("wheel", handleWheel, { passive: false });
    }
    return () => {
      for (const target of targets) {
        target.removeEventListener("wheel", handleWheel);
      }
    };
  }, []);

  const releaseLock = useCallback((source: "left" | "right" | "rail") => {
    Promise.resolve().then(() => {
      if (lockRef.current === source) {
        lockRef.current = null;
      }
    });
  }, []);

  const syncScrollLeft = useCallback((source: "left" | "right" | "rail", value: number) => {
    const leftViewport = leftViewportRef.current;
    const rightViewport = rightViewportRef.current;
    const rail = railRef.current;
    if (leftViewport === null || rightViewport === null || rail === null) {
      return;
    }
    lockRef.current = source;
    if (source !== "left" && leftViewport.scrollLeft !== value) {
      leftViewport.scrollLeft = value;
    }
    if (source !== "right" && rightViewport.scrollLeft !== value) {
      rightViewport.scrollLeft = value;
    }
    if (source !== "rail" && rail.scrollLeft !== value) {
      rail.scrollLeft = value;
    }
    releaseLock(source);
  }, [releaseLock]);

  const handleLeftScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (lockRef.current === "right" || lockRef.current === "rail") {
      return;
    }
    syncScrollLeft("left", event.currentTarget.scrollLeft);
  }, [syncScrollLeft]);

  const handleRightScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (lockRef.current === "left" || lockRef.current === "rail") {
      return;
    }
    syncScrollLeft("right", event.currentTarget.scrollLeft);
  }, [syncScrollLeft]);

  const handleRailScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (lockRef.current === "left" || lockRef.current === "right") {
      return;
    }
    syncScrollLeft("rail", event.currentTarget.scrollLeft);
  }, [syncScrollLeft]);

  const railClassName = showHorizontalRail
    ? "workspace-diff-code-horizontal-scroll workspace-diff-code-horizontal-scroll-active"
    : "workspace-diff-code-horizontal-scroll workspace-diff-code-horizontal-scroll-inactive";
  const surfaceStyle = surfaceWidth > 0 ? { width: `${surfaceWidth}px` } : undefined;

  const frameClassName = props.wrapLines
    ? "workspace-diff-code-frame workspace-diff-code-frame-split workspace-diff-code-frame-wrap"
    : "workspace-diff-code-frame workspace-diff-code-frame-split";

  return (
    <div className={frameClassName}>
      <div className="workspace-diff-code-scroll workspace-diff-code-scroll-split-vertical" role="presentation">
        <div className="workspace-diff-split-frame">
          <div ref={leftViewportRef} className="workspace-diff-split-pane" onScroll={handleLeftScroll}>
            <div ref={leftSurfaceRef} className="workspace-diff-split-pane-surface" style={surfaceStyle}>
              {props.leftPane}
            </div>
          </div>
          <div ref={rightViewportRef} className="workspace-diff-split-pane" onScroll={handleRightScroll}>
            <div ref={rightSurfaceRef} className="workspace-diff-split-pane-surface" style={surfaceStyle}>
              {props.rightPane}
            </div>
          </div>
        </div>
      </div>
      <div
        ref={railRef}
        className={railClassName}
        aria-hidden={false}
        onScroll={handleRailScroll}
      >
        <div className="workspace-diff-code-horizontal-spacer" style={{ width: `${railSpacerWidth}px` }} />
      </div>
    </div>
  );
}

interface DiffTextSegment {
  readonly text: string;
  readonly changed: boolean;
}

const WORD_DIFF_TOKEN_LIMIT = 360;

function splitDiffTextTokens(text: string): ReadonlyArray<string> {
  return text.match(/\s+|[A-Za-z0-9_$]+|./gu) ?? [];
}

function mergeTextSegments(segments: ReadonlyArray<DiffTextSegment>): ReadonlyArray<DiffTextSegment> {
  const merged: DiffTextSegment[] = [];
  for (const segment of segments) {
    if (segment.text.length === 0) {
      continue;
    }
    const previous = merged.at(-1);
    if (previous !== undefined && previous.changed === segment.changed) {
      merged[merged.length - 1] = {
        changed: previous.changed,
        text: `${previous.text}${segment.text}`,
      };
      continue;
    }
    merged.push(segment);
  }
  return merged;
}

function createSimpleChangedSegments(text: string, changed: boolean): ReadonlyArray<DiffTextSegment> {
  return text.length === 0 ? [] : [{ text, changed }];
}

function createAffixWordDiffSegments(
  oldText: string,
  newText: string,
): readonly [ReadonlyArray<DiffTextSegment>, ReadonlyArray<DiffTextSegment>] {
  let prefixLength = 0;
  const maxPrefixLength = Math.min(oldText.length, newText.length);
  while (prefixLength < maxPrefixLength && oldText[prefixLength] === newText[prefixLength]) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  const maxSuffixLength = maxPrefixLength - prefixLength;
  while (
    suffixLength < maxSuffixLength
    && oldText[oldText.length - 1 - suffixLength] === newText[newText.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const toSegments = (text: string) => mergeTextSegments([
    { text: text.slice(0, prefixLength), changed: false },
    { text: text.slice(prefixLength, text.length - suffixLength), changed: true },
    { text: suffixLength === 0 ? "" : text.slice(text.length - suffixLength), changed: false },
  ]);

  return [toSegments(oldText), toSegments(newText)];
}

function createWordDiffSegments(
  oldText: string,
  newText: string,
): readonly [ReadonlyArray<DiffTextSegment>, ReadonlyArray<DiffTextSegment>] {
  if (oldText === newText) {
    const unchanged = createSimpleChangedSegments(oldText, false);
    return [unchanged, unchanged];
  }

  const oldTokens = splitDiffTextTokens(oldText);
  const newTokens = splitDiffTextTokens(newText);
  if (oldTokens.length === 0 || newTokens.length === 0) {
    return [createSimpleChangedSegments(oldText, true), createSimpleChangedSegments(newText, true)];
  }
  if (oldTokens.length > WORD_DIFF_TOKEN_LIMIT || newTokens.length > WORD_DIFF_TOKEN_LIMIT) {
    return createAffixWordDiffSegments(oldText, newText);
  }

  const table = Array.from(
    { length: oldTokens.length + 1 },
    () => new Uint16Array(newTokens.length + 1),
  );
  for (let oldIndex = oldTokens.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newTokens.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex]![newIndex] = oldTokens[oldIndex] === newTokens[newIndex]
        ? table[oldIndex + 1]![newIndex + 1]! + 1
        : Math.max(table[oldIndex + 1]![newIndex]!, table[oldIndex]![newIndex + 1]!);
    }
  }

  const oldSegments: DiffTextSegment[] = [];
  const newSegments: DiffTextSegment[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldTokens.length && newIndex < newTokens.length) {
    if (oldTokens[oldIndex] === newTokens[newIndex]) {
      oldSegments.push({ text: oldTokens[oldIndex]!, changed: false });
      newSegments.push({ text: newTokens[newIndex]!, changed: false });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    if (table[oldIndex + 1]![newIndex]! >= table[oldIndex]![newIndex + 1]!) {
      oldSegments.push({ text: oldTokens[oldIndex]!, changed: true });
      oldIndex += 1;
      continue;
    }
    newSegments.push({ text: newTokens[newIndex]!, changed: true });
    newIndex += 1;
  }
  while (oldIndex < oldTokens.length) {
    oldSegments.push({ text: oldTokens[oldIndex]!, changed: true });
    oldIndex += 1;
  }
  while (newIndex < newTokens.length) {
    newSegments.push({ text: newTokens[newIndex]!, changed: true });
    newIndex += 1;
  }

  return [mergeTextSegments(oldSegments), mergeTextSegments(newSegments)];
}

function formatLineNumber(value: number | null): string {
  return value === null ? "" : String(value);
}

function getUnifiedLineNumber(row: ParsedDiffLine | CollapsedDiffRow): number | null {
  if (row.kind === "add") {
    return row.newLine;
  }
  if (row.kind === "delete") {
    return row.oldLine;
  }
  return row.newLine ?? row.oldLine;
}

function getRowClassName(row: DiffDisplayRow): string {
  if (row.kind === "collapsed") {
    return "workspace-diff-code-row workspace-diff-code-row-collapsed";
  }
  if (row.kind === "add") {
    return "workspace-diff-code-row workspace-diff-code-row-add";
  }
  if (row.kind === "delete") {
    return "workspace-diff-code-row workspace-diff-code-row-delete";
  }
  if (row.kind === "meta") {
    return "workspace-diff-code-row workspace-diff-code-row-meta";
  }
  return "workspace-diff-code-row";
}

function DiffCodeLineNumbers(props: { readonly row: ParsedDiffLine | CollapsedDiffRow }): JSX.Element {
  return (
    <span className="workspace-diff-line-number">{formatLineNumber(getUnifiedLineNumber(props.row))}</span>
  );
}

function CollapsedDiffRowView(props: { readonly row: CollapsedDiffRow }): JSX.Element {
  return (
    <div className={getRowClassName(props.row)}>
      <DiffCodeLineNumbers row={props.row} />
      <div className="workspace-diff-collapsed-pill">{props.row.count} unmodified lines</div>
    </div>
  );
}

function DiffLineContent(props: {
  readonly className: string;
  readonly content: string;
  readonly path?: string;
  readonly richPreview: boolean;
  readonly segments?: ReadonlyArray<DiffTextSegment>;
}): JSX.Element {
  if (props.segments !== undefined) {
    return (
      <code className={props.className}>
        {props.segments.map((segment, index) => (
          <span
            key={`${index}:${segment.text}`}
            className={segment.changed ? "workspace-diff-word-change" : undefined}
          >
            {segment.text}
          </span>
        ))}
      </code>
    );
  }
  if (!props.richPreview) {
    return <code className={props.className}>{props.content}</code>;
  }
  return <HighlightedCodeContent className={props.className} content={props.content} path={props.path} />;
}

function ParsedDiffRowView(props: {
  readonly row: ParsedDiffLine;
  readonly path?: string;
  readonly richPreview: boolean;
  readonly segments?: ReadonlyArray<DiffTextSegment>;
}): JSX.Element {
  return (
    <div className={getRowClassName(props.row)}>
      <DiffCodeLineNumbers row={props.row} />
      <DiffLineContent
        className="workspace-diff-code-content"
        content={props.row.content}
        path={props.path}
        richPreview={props.richPreview}
        segments={props.segments}
      />
    </div>
  );
}

function DiffCodeRow(props: {
  readonly row: DiffDisplayRow;
  readonly path?: string;
  readonly richPreview: boolean;
  readonly wordSegments: WeakMap<ParsedDiffLine, ReadonlyArray<DiffTextSegment>> | null;
}): JSX.Element {
  if (props.row.kind === "collapsed") {
    return <CollapsedDiffRowView row={props.row} />;
  }
  return (
    <ParsedDiffRowView
      row={props.row}
      path={props.path}
      richPreview={props.richPreview}
      segments={props.wordSegments?.get(props.row)}
    />
  );
}

function HunkHeader(props: { readonly hunk: ParsedDiffHunk }): JSX.Element | null {
  if (props.hunk.sectionTitle.length === 0) {
    return null;
  }
  return <div className="workspace-diff-hunk-header">{props.hunk.sectionTitle}</div>;
}

function HunkBody(props: {
  readonly hunk: ParsedDiffHunk;
  readonly path?: string;
  readonly richPreview: boolean;
  readonly wordDiff: boolean;
}): JSX.Element {
  const rows = collapseDiffRows(props.hunk.lines);
  const wordSegments = props.wordDiff ? buildWordDiffSegmentMap(rows, props.hunk.header) : null;
  return (
    <div className="workspace-diff-hunk-body">
      {rows.map((row, index) => (
        <DiffCodeRow
          key={`${props.hunk.header}:${index}`}
          row={row}
          path={props.path}
          richPreview={props.richPreview}
          wordSegments={wordSegments}
        />
      ))}
    </div>
  );
}

interface SplitRowPair {
  readonly key: string;
  readonly left: ParsedDiffLine | CollapsedDiffRow | null;
  readonly right: ParsedDiffLine | CollapsedDiffRow | null;
  readonly leftSegments?: ReadonlyArray<DiffTextSegment>;
  readonly rightSegments?: ReadonlyArray<DiffTextSegment>;
}

function toSplitPairs(
  rows: ReadonlyArray<DiffDisplayRow>,
  hunkHeader: string,
  wordDiff: boolean,
): ReadonlyArray<SplitRowPair> {
  const pairs: SplitRowPair[] = [];
  let i = 0;
  let counter = 0;
  while (i < rows.length) {
    const row = rows[i]!;
    if (row.kind === "collapsed") {
      pairs.push({ key: `${hunkHeader}:c:${counter++}`, left: row, right: row });
      i += 1;
      continue;
    }
    if (row.kind === "meta" || row.kind === "context") {
      pairs.push({ key: `${hunkHeader}:k:${counter++}`, left: row, right: row });
      i += 1;
      continue;
    }
    if (row.kind === "delete") {
      const deletes: ParsedDiffLine[] = [row];
      let j = i + 1;
      while (j < rows.length) {
        const next = rows[j]!;
        if (next.kind === "delete") {
          deletes.push(next);
          j += 1;
          continue;
        }
        break;
      }
      const adds: ParsedDiffLine[] = [];
      while (j < rows.length) {
        const next = rows[j]!;
        if (next.kind === "add") {
          adds.push(next);
          j += 1;
          continue;
        }
        break;
      }
      const pairCount = Math.max(deletes.length, adds.length);
      for (let p = 0; p < pairCount; p += 1) {
        const deleteRow = deletes[p] ?? null;
        const addRow = adds[p] ?? null;
        const segments = wordDiff && deleteRow !== null && addRow !== null
          ? createWordDiffSegments(deleteRow.content, addRow.content)
          : null;
        pairs.push({
          key: `${hunkHeader}:p:${counter++}`,
          left: deleteRow,
          right: addRow,
          leftSegments: segments?.[0],
          rightSegments: segments?.[1],
        });
      }
      i = j;
      continue;
    }
    if (row.kind === "add") {
      pairs.push({ key: `${hunkHeader}:a:${counter++}`, left: null, right: row });
      i += 1;
      continue;
    }
    i += 1;
  }
  return pairs;
}

function buildWordDiffSegmentMap(
  rows: ReadonlyArray<DiffDisplayRow>,
  hunkHeader: string,
): WeakMap<ParsedDiffLine, ReadonlyArray<DiffTextSegment>> {
  const map = new WeakMap<ParsedDiffLine, ReadonlyArray<DiffTextSegment>>();
  for (const pair of toSplitPairs(rows, hunkHeader, true)) {
    if (pair.left !== null && pair.left.kind !== "collapsed" && pair.leftSegments !== undefined) {
      map.set(pair.left, pair.leftSegments);
    }
    if (pair.right !== null && pair.right.kind !== "collapsed" && pair.rightSegments !== undefined) {
      map.set(pair.right, pair.rightSegments);
    }
  }
  return map;
}

function SplitHalf(props: {
  readonly row: ParsedDiffLine | CollapsedDiffRow | null;
  readonly side: "old" | "new";
  readonly path?: string;
  readonly richPreview: boolean;
  readonly segments?: ReadonlyArray<DiffTextSegment>;
}): JSX.Element {
  if (props.row === null) {
    return <div className="workspace-diff-code-row workspace-diff-code-row-empty" aria-hidden="true" />;
  }
  if (props.row.kind === "collapsed") {
    const value = props.side === "old" ? props.row.oldLine : props.row.newLine;
    return (
      <div className="workspace-diff-code-row workspace-diff-code-row-collapsed">
        <span className="workspace-diff-line-number">{formatLineNumber(value)}</span>
        <div className="workspace-diff-collapsed-pill">{props.row.count} unmodified lines</div>
      </div>
    );
  }
  const value = props.side === "old" ? props.row.oldLine : props.row.newLine;
  return (
    <div className={getRowClassName(props.row)}>
      <span className="workspace-diff-line-number">{formatLineNumber(value)}</span>
      <DiffLineContent
        className="workspace-diff-code-content"
        content={props.row.content}
        path={props.path}
        richPreview={props.richPreview}
        segments={props.segments}
      />
    </div>
  );
}

interface SplitHunkData {
  readonly hunk: ParsedDiffHunk;
  readonly pairs: ReadonlyArray<SplitRowPair>;
}

function buildSplitHunkData(hunk: ParsedDiffHunk, wordDiff: boolean): SplitHunkData {
  return {
    hunk,
    pairs: toSplitPairs(collapseDiffRows(hunk.lines), hunk.header, wordDiff),
  };
}

function SplitPaneHunk(props: {
  readonly data: SplitHunkData;
  readonly path?: string;
  readonly richPreview: boolean;
  readonly side: "old" | "new";
}): JSX.Element {
  return (
    <section className="workspace-diff-hunk workspace-diff-hunk-split-pane">
      <HunkHeader hunk={props.data.hunk} />
      <div className="workspace-diff-hunk-split-pane-body">
        {props.data.pairs.map((pair) => (
          <SplitHalf
            key={`${pair.key}:${props.side}`}
            row={props.side === "old" ? pair.left : pair.right}
            side={props.side}
            path={props.path}
            richPreview={props.richPreview}
            segments={props.side === "old" ? pair.leftSegments : pair.rightSegments}
          />
        ))}
      </div>
    </section>
  );
}

function DiffHunkView(props: {
  readonly hunk: ParsedDiffHunk;
  readonly path?: string;
  readonly richPreview: boolean;
  readonly wordDiff: boolean;
}): JSX.Element {
  return (
    <section className="workspace-diff-hunk">
      <HunkHeader hunk={props.hunk} />
      <HunkBody
        hunk={props.hunk}
        path={props.path}
        richPreview={props.richPreview}
        wordDiff={props.wordDiff}
      />
    </section>
  );
}

function RawDiffFallback(props: {
  readonly parsed: ParsedDiffFile;
  readonly wordWrap: boolean;
}): JSX.Element {
  const className = props.wordWrap ? "workspace-diff-raw workspace-diff-raw-wrap" : "workspace-diff-raw";
  return (
    <div className={className}>
      <div className="workspace-diff-raw-note">当前 diff 暂时无法结构化展示，下面显示原始输出。</div>
      <pre className="workspace-diff-raw-content">{props.parsed.raw}</pre>
    </div>
  );
}

function StructuredDiff(props: {
  readonly parsed: ParsedDiffFile;
  readonly path?: string;
  readonly viewStyle: DiffViewStyle;
  readonly wordWrap: boolean;
  readonly richPreview: boolean;
  readonly wordDiff: boolean;
}): JSX.Element {
  if (props.viewStyle === "split") {
    const splitHunks = props.parsed.hunks.map((hunk) => buildSplitHunkData(hunk, props.wordDiff));
    return (
      <SplitDiffFrame
        wrapLines={props.wordWrap}
        leftPane={splitHunks.map((data) => (
          <SplitPaneHunk
            key={`${data.hunk.header}:old`}
            data={data}
            path={props.path}
            richPreview={props.richPreview}
            side="old"
          />
        ))}
        rightPane={splitHunks.map((data) => (
          <SplitPaneHunk
            key={`${data.hunk.header}:new`}
            data={data}
            path={props.path}
            richPreview={props.richPreview}
            side="new"
          />
        ))}
      />
    );
  }
  return (
    <DiffScrollFrame scrollClassName="workspace-diff-code-scroll" wrapLines={props.wordWrap}>
      <>
        {props.parsed.hunks.map((hunk) => (
          <DiffHunkView
            key={hunk.header}
            hunk={hunk}
            path={props.path}
            richPreview={props.richPreview}
            wordDiff={props.wordDiff}
          />
        ))}
      </>
    </DiffScrollFrame>
  );
}

export function GitDiffCodeView(props: GitDiffCodeViewProps): JSX.Element {
  const parsed = props.parsed ?? parseUnifiedDiffCached(props.diff ?? "");
  const viewStyle = props.viewStyle ?? "unified";
  const wordWrap = props.wordWrap ?? false;
  const richPreview = props.richPreview ?? true;
  const wordDiff = props.wordDiff ?? false;
  if (parsed.hunks.length === 0) {
    return <RawDiffFallback parsed={parsed} wordWrap={wordWrap} />;
  }
  return (
    <StructuredDiff
      parsed={parsed}
      path={props.path}
      viewStyle={viewStyle}
      wordWrap={wordWrap}
      richPreview={richPreview}
      wordDiff={wordDiff}
    />
  );
}
