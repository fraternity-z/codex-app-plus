import { useEffect } from "react";

const STARTUP_SCREEN_ID = "startup-screen";
const STARTUP_SCREEN_EXIT_CLASS = "startup-screen--exiting";
const STARTUP_SCREEN_REMOVE_DELAY_MS = 420;

export function dismissStartupScreen(): void {
  const startupScreen = document.getElementById(STARTUP_SCREEN_ID);
  if (!(startupScreen instanceof HTMLElement) || startupScreen.dataset.state === "closed") {
    return;
  }
  startupScreen.dataset.state = "closed";
  startupScreen.classList.add(STARTUP_SCREEN_EXIT_CLASS);
  window.setTimeout(() => startupScreen.remove(), STARTUP_SCREEN_REMOVE_DELAY_MS);
}

export function useDismissStartupScreen(ready: boolean): void {
  useEffect(() => {
    if (ready) {
      dismissStartupScreen();
    }
  }, [ready]);
}
