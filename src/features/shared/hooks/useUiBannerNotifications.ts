import { useCallback } from "react";
import type { UiBanner } from "../../../domain/types";
import type { NoticeLevel } from "../../../domain/timeline";
import { useAppDispatch } from "../../../state/store";

interface PushBannerInput {
  readonly level: NoticeLevel;
  readonly title: string;
  readonly detail?: string | null;
  readonly source?: string;
}

interface ReportErrorOptions {
  readonly detail?: string | null;
  readonly logMessage?: string;
  readonly rethrow?: boolean;
}

interface UiBannerNotifications {
  readonly pushBanner: (input: PushBannerInput) => void;
  readonly notifyError: (title: string, error: unknown, detail?: string | null) => void;
  readonly reportError: (title: string, error: unknown, options?: ReportErrorOptions) => void;
  readonly dismissBanner: (bannerId: string) => void;
}

function createBannerId(source: string, title: string, detail: string | null): string {
  return [source, title, detail ?? ""].join(":");
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createBanner(
  source: string,
  input: PushBannerInput,
): UiBanner {
  const bannerSource = input.source ?? source;
  const detail = input.detail ?? null;
  return {
    id: createBannerId(bannerSource, input.title, detail),
    level: input.level,
    title: input.title,
    detail,
    source: bannerSource,
  };
}

export function useUiBannerNotifications(source = "ui"): UiBannerNotifications {
  const dispatch = useAppDispatch();

  const pushBanner = useCallback((input: PushBannerInput) => {
    dispatch({ type: "banner/pushed", banner: createBanner(source, input) });
  }, [dispatch, source]);

  const notifyError = useCallback((title: string, error: unknown, detail?: string | null) => {
    pushBanner({
      level: "error",
      title,
      detail: detail ?? toErrorMessage(error),
    });
  }, [pushBanner]);

  const reportError = useCallback((title: string, error: unknown, options?: ReportErrorOptions) => {
    console.error(options?.logMessage ?? title, error);
    notifyError(title, error, options?.detail);
    if (options?.rethrow) {
      throw error;
    }
  }, [notifyError]);

  const dismissBanner = useCallback((bannerId: string) => {
    dispatch({ type: "banner/dismissed", bannerId });
  }, [dispatch]);

  return { pushBanner, notifyError, reportError, dismissBanner };
}
