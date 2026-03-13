import { useEffect, useState } from "react";
import type { ConnectionStatus } from "../../../domain/types";
import type { ConnectionRetryInfo } from "../model/homeConnectionRetry";

interface HomeConnectionStatusToastProps {
  readonly connectionStatus: ConnectionStatus;
  readonly retryInfo: ConnectionRetryInfo | null;
  readonly fatalError: string | null;
  readonly retryScheduledAt: number | null;
  readonly busy: boolean;
  readonly onRetryConnection: () => Promise<void>;
}

export function HomeConnectionStatusToast(props: HomeConnectionStatusToastProps): JSX.Element | null {
  const shouldShow = shouldRenderToast(props);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (props.retryScheduledAt === null) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [props.retryScheduledAt]);

  if (!shouldShow) {
    return null;
  }

  const countdown = computeCountdown(props.retryScheduledAt, now);
  const disabled = props.busy || props.connectionStatus === "connecting";
  const statusText = resolveStatusMessage(props);

  return (
    <div className="home-connection-toast" role="status" aria-live="polite" data-status={props.connectionStatus}>
      <div className="home-connection-toast-body">
        <div className="home-connection-toast-text">
          <strong>{statusText}</strong>
          {countdown !== null ? <span className="home-connection-toast-countdown">预计 {countdown}s 后自动重试</span> : null}
        </div>
        <button
          type="button"
          className="home-connection-toast-action"
          disabled={disabled}
          onClick={() => void props.onRetryConnection()}
        >
          立即重试
        </button>
      </div>
    </div>
  );
}

function shouldRenderToast(props: HomeConnectionStatusToastProps): boolean {
  if (props.fatalError !== null) {
    return true;
  }
  if (props.retryInfo !== null) {
    return true;
  }
  if (props.connectionStatus !== "connected") {
    return true;
  }
  return props.retryScheduledAt !== null;
}

function computeCountdown(retryScheduledAt: number | null, now: number): number | null {
  if (retryScheduledAt === null) {
    return null;
  }
  const diffSeconds = Math.ceil((retryScheduledAt - now) / 1_000);
  if (Number.isNaN(diffSeconds) || diffSeconds <= 0) {
    return 0;
  }
  return diffSeconds;
}

function resolveStatusMessage(props: HomeConnectionStatusToastProps): string {
  if (props.fatalError !== null) {
    return props.fatalError;
  }
  if (props.retryInfo !== null) {
    return `正在重连… ${props.retryInfo.attempt}/${props.retryInfo.total}`;
  }
  if (props.connectionStatus === "connecting") {
    return "正在连接到服务器…";
  }
  if (props.connectionStatus === "error") {
    return "连接异常，正在等待自动重试";
  }
  if (props.connectionStatus === "disconnected") {
    return "已断开，与服务器暂时失联";
  }
  return "连接状态未知";
}
