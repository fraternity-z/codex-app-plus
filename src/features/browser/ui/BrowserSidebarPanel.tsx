import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BrowserSidebarBoundsInput, HostBridge } from "../../../bridge/types";
import { useI18n } from "../../../i18n/useI18n";

const DEFAULT_BROWSER_URL = "https://www.google.com";
const MIN_BROWSER_SURFACE_SIZE = 24;
const BROWSER_SURFACE_BOTTOM_INSET = 12;

interface BrowserSidebarPanelProps {
  readonly active: boolean;
  readonly hostBridge: HostBridge;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parsePixelValue(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveAvailableSurfaceHeight(element: HTMLElement, surfaceRect: DOMRect): number {
  const sidebar = element.closest(".workspace-diff-sidebar");
  if (!(sidebar instanceof HTMLElement)) {
    return surfaceRect.height;
  }
  const sidebarRect = sidebar.getBoundingClientRect();
  const parentStyle = element.parentElement === null ? null : window.getComputedStyle(element.parentElement);
  const bottomInset = parentStyle === null
    ? BROWSER_SURFACE_BOTTOM_INSET
    : parsePixelValue(parentStyle.paddingBottom) ?? BROWSER_SURFACE_BOTTOM_INSET;
  const availableHeight = sidebarRect.bottom - surfaceRect.top - bottomInset;
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
    return surfaceRect.height;
  }
  return Math.max(surfaceRect.height, availableHeight);
}

function readBounds(element: HTMLElement): BrowserSidebarBoundsInput | null {
  const rect = element.getBoundingClientRect();
  const height = resolveAvailableSurfaceHeight(element, rect);
  if (rect.width < MIN_BROWSER_SURFACE_SIZE || height < MIN_BROWSER_SURFACE_SIZE) {
    return null;
  }
  return {
    x: Math.max(0, rect.left),
    y: Math.max(0, rect.top),
    width: rect.width,
    height,
    visible: true,
  };
}

export function BrowserSidebarPanel(props: BrowserSidebarPanelProps): JSX.Element {
  const { t } = useI18n();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const currentUrlRef = useRef(DEFAULT_BROWSER_URL);
  const browserCreatedRef = useRef(false);
  const openingRef = useRef<Promise<void> | null>(null);
  const [address, setAddress] = useState(DEFAULT_BROWSER_URL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAtCurrentBounds = useCallback(async (url: string) => {
    if (openingRef.current !== null) {
      await openingRef.current;
    }
    const surface = surfaceRef.current;
    if (surface === null) {
      return;
    }
    const bounds = readBounds(surface);
    if (bounds === null) {
      return;
    }
    const openPromise = props.hostBridge.app.openBrowserSidebar({ ...bounds, url });
    openingRef.current = openPromise;
    try {
      await openPromise;
      browserCreatedRef.current = true;
      currentUrlRef.current = url;
      setError(null);
      const latestSurface = surfaceRef.current;
      const latestBounds = latestSurface === null ? null : readBounds(latestSurface);
      if (props.active && latestBounds !== null) {
        void props.hostBridge.app.updateBrowserSidebarBounds(latestBounds).catch((error: unknown) => {
          setError(t("home.sidePanel.browserResizeFailed", { error: toErrorMessage(error) }));
        });
      }
    } finally {
      if (openingRef.current === openPromise) {
        openingRef.current = null;
      }
    }
  }, [props.active, props.hostBridge, t]);

  const updateBounds = useCallback(() => {
    const surface = surfaceRef.current;
    if (surface === null || !props.active) {
      return;
    }
    const bounds = readBounds(surface);
    if (bounds === null) {
      void props.hostBridge.app.hideBrowserSidebar();
      return;
    }
    if (!browserCreatedRef.current) {
      if (openingRef.current !== null) {
        return;
      }
      void openAtCurrentBounds(currentUrlRef.current).catch((error: unknown) => {
        setError(t("home.sidePanel.browserOpenFailed", { error: toErrorMessage(error) }));
      });
      return;
    }
    void props.hostBridge.app.updateBrowserSidebarBounds(bounds).catch((error: unknown) => {
      setError(t("home.sidePanel.browserResizeFailed", { error: toErrorMessage(error) }));
    });
  }, [openAtCurrentBounds, props.active, props.hostBridge, t]);

  useLayoutEffect(() => {
    if (!props.active) {
      void props.hostBridge.app.hideBrowserSidebar();
      return undefined;
    }

    let animationFrame = window.requestAnimationFrame(() => updateBounds());
    const surface = surfaceRef.current;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => updateBounds());
    });
    if (surface !== null) {
      observer?.observe(surface);
    }
    window.addEventListener("resize", updateBounds);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener("resize", updateBounds);
      void props.hostBridge.app.hideBrowserSidebar();
    };
  }, [props.active, props.hostBridge, updateBounds]);

  useEffect(() => {
    if (!props.active) {
      return;
    }
    updateBounds();
  }, [props.active, updateBounds]);

  const submitAddress = useCallback(async () => {
    const nextUrl = address.trim() || DEFAULT_BROWSER_URL;
    setBusy(true);
    setError(null);
    try {
      await openAtCurrentBounds(nextUrl);
      setAddress(nextUrl);
    } catch (error) {
      setError(t("home.sidePanel.browserOpenFailed", { error: toErrorMessage(error) }));
    } finally {
      setBusy(false);
    }
  }, [address, openAtCurrentBounds, t]);

  return (
    <div className="workspace-side-browser">
      <form
        className="workspace-side-browser-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void submitAddress();
        }}
      >
        <input
          className="workspace-side-browser-address"
          aria-label={t("home.sidePanel.browserAddress")}
          value={address}
          onChange={(event) => setAddress(event.currentTarget.value)}
          placeholder={t("home.sidePanel.browserAddressPlaceholder")}
        />
        <button
          type="submit"
          className="workspace-side-browser-go"
          disabled={busy}
        >
          {busy ? t("home.sidePanel.browserOpening") : t("home.sidePanel.browserGo")}
        </button>
      </form>
      {error === null ? null : (
        <div className="workspace-side-browser-error" role="alert">
          {error}
        </div>
      )}
      <div
        ref={surfaceRef}
        className="workspace-side-browser-surface"
        aria-label={t("home.sidePanel.browserSurface")}
      >
        <span>{t("home.sidePanel.browserLoading")}</span>
      </div>
    </div>
  );
}
